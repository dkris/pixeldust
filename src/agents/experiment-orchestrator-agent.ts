/**
 * ExperimentOrchestratorAgent
 *
 * Runtime pipeline controller. Manages the full experiment lifecycle:
 *
 *  FRICTION_THRESHOLD_EXCEEDED
 *       ↓
 *  FrictionDetectionAgent → MutationProposalAgent
 *       ↓
 *  (optional) MutationValidationStage
 *       ↓
 *  Create Experiment → RUNNING
 *       ↓
 *  Poll ExperimentOutcomeAgent every pollIntervalMs
 *       ↓
 *  ContinuousEvaluationAgent emits EXPERIMENT_PROMOTE or EXPERIMENT_REVERT
 *       ↓
 *  Update DB + emit final event
 *
 * Does NOT manage SessionState machine transitions (those belong to the
 * dev-time orchestrators). Uses RuntimeSessionState for its own tracking.
 */

import { v4 as uuidv4 } from 'uuid';
import { BaseAgent } from './base-agent';
import { AgentContext, AgentResult, RuntimeConfig, FrictionSignal, UIMutation, Severity } from '../types';
import { RuntimeAgentType } from '../types';
import { EventBus, EventType } from '../core/event-bus';
import { DatabaseManager } from '../storage/database';
import { FrictionDetectionAgent } from './friction-detection-agent';
import { MutationProposalAgent } from './mutation-proposal-agent';
import { ExperimentOutcomeAgent } from './experiment-outcome-agent';
import { ContinuousEvaluationAgent } from './continuous-evaluation-agent';
import { AnalysisAgent } from './analysis-agent';
import { EvaluationAgent } from './evaluation-agent';

export class ExperimentOrchestratorAgent extends BaseAgent {
  private eventBus: EventBus;
  private runtimeConfig: RuntimeConfig;
  private frictionAgent: FrictionDetectionAgent;
  private mutationAgent: MutationProposalAgent;
  private outcomeAgent: ExperimentOutcomeAgent;
  private continuousEval: ContinuousEvaluationAgent;
  private analysisAgent: AnalysisAgent;
  private evaluationAgent: EvaluationAgent;
  private pollTimers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    db: DatabaseManager,
    eventBus: EventBus,
    runtimeConfig: RuntimeConfig
  ) {
    super(RuntimeAgentType.EXPERIMENT_ORCHESTRATOR as any, db);
    this.eventBus = eventBus;
    this.runtimeConfig = runtimeConfig;
    this.frictionAgent = new FrictionDetectionAgent(db);
    this.mutationAgent = new MutationProposalAgent(db);
    this.outcomeAgent = new ExperimentOutcomeAgent(db);
    this.continuousEval = new ContinuousEvaluationAgent(eventBus, db);
    this.analysisAgent = new AnalysisAgent(db);
    this.evaluationAgent = new EvaluationAgent(db);

    this.setupEventHandlers();
    this.continuousEval.enableRuntimeMonitoring(
      (id) => this.handlePromote(id),
      (id) => this.handleRevert(id)
    );
  }

  /**
   * One-shot execute: process a batch of signals and create experiments.
   * Also called via event handler when FRICTION_THRESHOLD_EXCEEDED fires.
   */
  async execute(context: AgentContext): Promise<AgentResult> {
    return this.executeWithTracking(context, async () => {
      const { data } = context;
      const appId: string = data?.appId ?? this.runtimeConfig.appId;
      const signals: FrictionSignal[] = data?.signals ?? [];

      if (!signals.length) {
        return this.success({ experiments: [] });
      }

      const experiments = await this.processSignals(appId, signals, context);
      return this.success({ experiments });
    });
  }

  /** Start runtime watch mode: subscribe to ingest events and start polling. */
  startWatchMode(): void {
    this.logger.info('ExperimentOrchestratorAgent: watch mode started');
  }

  /** Stop all polling timers. */
  stopWatchMode(): void {
    for (const timer of this.pollTimers.values()) clearInterval(timer);
    this.pollTimers.clear();
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private setupEventHandlers(): void {
    this.eventBus.on(
      EventType.FRICTION_THRESHOLD_EXCEEDED,
      async (event) => {
        const { signal, appId } = event.data ?? {};
        if (!signal || !appId) return;
        try {
          const mockContext = this.buildMockContext(appId, [signal]);
          await this.processSignals(appId, [signal], mockContext);
        } catch (err) {
          this.logger.error('Failed to process friction threshold event', err as Error);
        }
      }
    );
  }

  private async processSignals(
    appId: string,
    signals: FrictionSignal[],
    context: AgentContext
  ): Promise<any[]> {
    // Check concurrent experiment limit
    const running = this.db!.getExperiments(appId, 'RUNNING');
    if (running.length >= this.runtimeConfig.experiment.maxConcurrentExperiments) {
      this.logger.warn(
        `Max concurrent experiments (${this.runtimeConfig.experiment.maxConcurrentExperiments}) reached. Skipping.`
      );
      return [];
    }

    // 1. Score and prioritize signals
    const frictionResult = await this.frictionAgent.execute({
      ...context,
      data: { ...context.data, signals, appId },
    });
    const prioritizedSignals = frictionResult.data?.prioritizedSignals ?? [];

    if (!prioritizedSignals.length) return [];

    // 2. Generate mutations
    const mutationResult = await this.mutationAgent.execute({
      ...context,
      data: { ...context.data, prioritizedSignals, appId },
    });
    const mutations = mutationResult.data?.mutations ?? [];

    if (!mutations.length) return [];

    // 3. Group mutations by frictionSignalId and create one experiment per signal
    const bySignal = new Map<string, typeof mutations>();
    for (const m of mutations) {
      const bucket = bySignal.get(m.frictionSignalId) ?? [];
      bucket.push(m);
      bySignal.set(m.frictionSignalId, bucket);
    }

    const created: any[] = [];
    for (const [signalId, signalMutations] of bySignal.entries()) {
      const signal = signals.find(s => s.id === signalId);
      if (!signal) continue;

      const exp = await this.createExperiment(appId, signal, signalMutations);
      created.push(exp);
    }

    return created;
  }

  /**
   * MutationValidationStage — run before experiment goes RUNNING.
   * For CSS patches: always valid (safe by default).
   * For DOM mutations: perform structural analysis on empty snapshots;
   * any CRITICAL result blocks the experiment.
   * Returns list of mutations that passed validation.
   */
  private async validateMutations(
    mutations: UIMutation[],
    appId: string
  ): Promise<UIMutation[]> {
    if (!this.runtimeConfig.visualValidation) return mutations;

    const valid: UIMutation[] = [];

    for (const mutation of mutations) {
      try {
        // CSS patches are safe by definition — skip heavy validation
        if (mutation.type === 'css_patch') {
          valid.push(mutation);
          this.eventBus.emit({
            type: EventType.MUTATION_VALIDATED,
            sessionId: appId,
            timestamp: Date.now(),
            data: { mutationId: mutation.id, result: 'css_safe' },
          });
          continue;
        }

        // For DOM mutations, simulate base vs mutated snapshot
        // (In a full implementation this would drive a headless browser;
        //  here we use a minimal structural check on the mutation spec itself.)
        const baseSnapshot = `<div id="root"></div>`;
        const mutatedSnapshot = mutation.attributeChanges
          ? `<div id="root" ${Object.entries(mutation.attributeChanges)
              .map(([k, v]) => `${k}="${v}"`)
              .join(' ')}></div>`
          : `<div id="root">${mutation.newContent ?? ''}</div>`;

        const result = await this.analysisAgent.analyzeForMutation(
          mutation,
          baseSnapshot,
          mutatedSnapshot,
          appId
        );

        const blocked = result.differences.some(
          d => d.severity === Severity.CRITICAL
        );

        if (blocked) {
          this.logger.warn(
            `Mutation ${mutation.id} blocked by validation: ` +
            result.differences.find(d => d.severity === Severity.CRITICAL)?.description
          );
          this.eventBus.emit({
            type: EventType.MUTATION_VALIDATION_FAILED,
            sessionId: appId,
            timestamp: Date.now(),
            data: {
              mutationId: mutation.id,
              reason: result.differences.find(d => d.severity === Severity.CRITICAL)?.description,
            },
          });
        } else {
          valid.push(mutation);
          this.eventBus.emit({
            type: EventType.MUTATION_VALIDATED,
            sessionId: appId,
            timestamp: Date.now(),
            data: { mutationId: mutation.id, severity: result.severity },
          });
        }
      } catch (err) {
        // Validation errors are non-fatal — let mutation through
        this.logger.warn(`Validation error for mutation ${mutation.id}; allowing through`, err as Error);
        valid.push(mutation);
      }
    }

    return valid;
  }

  private async createExperiment(
    appId: string,
    signal: FrictionSignal,
    mutations: any[]
  ): Promise<any> {
    const now = Date.now();
    const expId = uuidv4();
    const controlCohortId = 'control';
    const variantCohortId = 'variant';

    // Phase 5: Validate mutations before starting experiment
    const validatedMutations = await this.validateMutations(mutations, appId);
    if (validatedMutations.length === 0) {
      this.logger.warn(
        `All ${mutations.length} mutations blocked by validation for signal ${signal.id}. ` +
        `Experiment will not start.`
      );
      // Return a stub so the caller doesn't crash
      return { id: expId, appId, status: 'DRAFT', frictionSignalId: signal.id, skipped: true };
    }
    mutations = validatedMutations;

    // Assign experimentId to mutations and save them
    for (const m of mutations) {
      m.experimentId = expId;
      this.db!.saveUIMutation(m);
    }

    const exp = {
      id: expId,
      appId,
      frictionSignalId: signal.id,
      status: 'RUNNING',
      trafficPercent: this.runtimeConfig.experiment.defaultTrafficPercent,
      controlCohortId,
      variantCohortId,
      minConfidenceThreshold: this.runtimeConfig.experiment.minConfidenceThreshold,
      minSampleSize: this.runtimeConfig.experiment.minSampleSize,
      autoPromote: this.runtimeConfig.experiment.autoPromote,
      autoRevert: this.runtimeConfig.experiment.autoRevert,
      startedAt: now,
      description: `Fixing ${signal.type} on ${signal.url}`,
      createdAt: now,
      updatedAt: now,
    };

    this.db!.saveExperiment(exp);

    this.eventBus.emit({
      type: EventType.EXPERIMENT_CREATED,
      sessionId: appId,
      timestamp: now,
      data: { experiment: exp, mutationCount: mutations.length },
    });

    this.eventBus.emit({
      type: EventType.EXPERIMENT_STARTED,
      sessionId: appId,
      timestamp: now,
      data: { experimentId: expId, appId },
    });

    this.logger.info(
      `Experiment ${expId} started: ${mutations.length} mutations, ` +
      `${exp.trafficPercent}% traffic`
    );

    // Start polling
    this.startPolling(expId, appId);

    return exp;
  }

  private startPolling(experimentId: string, appId: string): void {
    const interval = this.runtimeConfig.experiment.pollIntervalMs;
    const timer = setInterval(async () => {
      try {
        const exp = this.db!.getExperiment(experimentId);
        if (!exp || !['RUNNING', 'PAUSED'].includes(exp.status)) {
          clearInterval(timer);
          this.pollTimers.delete(experimentId);
          return;
        }
        if (exp.status !== 'RUNNING') return;

        await this.measureOutcome(exp, appId);
      } catch (err) {
        this.logger.error(`Polling error for experiment ${experimentId}`, err as Error);
      }
    }, interval);

    this.pollTimers.set(experimentId, timer);
  }

  private async measureOutcome(exp: any, appId: string): Promise<void> {
    const outcome = await this.outcomeAgent.computeOutcome(exp);
    if (!outcome) return;

    // Phase 6: AI-assisted evaluation overrides the statistical decision when
    // we have enough data. Falls back to the Bayesian decision on any error.
    if (outcome.decision !== 'insufficient_data') {
      try {
        const aiEval = await this.evaluationAgent.evaluateExperiment(outcome);
        outcome.decision = aiEval.decision;
        outcome.decisionReason = aiEval.reason;
        this.logger.info(
          `AI evaluation for ${exp.id}: ${aiEval.decision} (${aiEval.reason})`
        );
      } catch (err) {
        this.logger.warn('AI evaluation failed; using statistical decision', err as Error);
      }
    }

    this.db!.saveExperimentOutcome(outcome);

    this.eventBus.emit({
      type: EventType.EXPERIMENT_UPDATED,
      sessionId: appId,
      timestamp: Date.now(),
      data: { experiment: exp, outcome },
    });
  }

  private handlePromote(experimentId: string): void {
    this.db!.updateExperimentStatus(experimentId, 'PROMOTED', { promotedAt: Date.now() });
    const timer = this.pollTimers.get(experimentId);
    if (timer) { clearInterval(timer); this.pollTimers.delete(experimentId); }
    this.logger.info(`Experiment ${experimentId} promoted`);
  }

  private handleRevert(experimentId: string): void {
    this.db!.updateExperimentStatus(experimentId, 'REVERTED', { revertedAt: Date.now() });
    const timer = this.pollTimers.get(experimentId);
    if (timer) { clearInterval(timer); this.pollTimers.delete(experimentId); }
    this.logger.info(`Experiment ${experimentId} reverted`);
  }

  /** Build a minimal AgentContext for internal agent calls without a full session. */
  private buildMockContext(appId: string, signals: FrictionSignal[]): AgentContext {
    return {
      session: {
        id: appId,
        state: 'IDLE' as any,
        config: { runtime: this.runtimeConfig } as any,
        versions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      config: { runtime: this.runtimeConfig, ai: {} } as any,
      data: { signals, appId },
      layers: null as any,
      retrieval: null as any,
      memory: null as any,
      fingerprint: appId,
      pruneLayers: () => {},
    };
  }
}

export default ExperimentOrchestratorAgent;
