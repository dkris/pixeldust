/**
 * ExperimentOutcomeAgent
 *
 * Computes ExperimentOutcome metrics by querying session_events and
 * cohort_assignments tables. Calculates:
 *   - Task completion rate (reached a "success" URL/event)
 *   - Error rate (JS errors + error_click events)
 *   - Abandonment rate (session ended without any goal event)
 *   - Average session duration
 *   - Bayesian confidence score (Beta distribution approximation)
 *   - Uplift (relative improvement of variant over control)
 *   - Automated promote/revert/continue decision
 *
 * No external libraries needed — Beta CDF approximated via regularized
 * incomplete Beta function (Lentz continued fraction algorithm).
 */

import { v4 as uuidv4 } from 'uuid';
import { BaseAgent } from './base-agent';
import { AgentContext, AgentResult, ExperimentOutcome } from '../types';
import { RuntimeAgentType } from '../types';
import { DatabaseManager } from '../storage/database';

// Goal events: sessions that contain any of these are counted as "completed"
const GOAL_EVENT_TYPES = ['form_submit', 'navigation'];

export class ExperimentOutcomeAgent extends BaseAgent {

  constructor(db?: DatabaseManager) {
    super(RuntimeAgentType.EXPERIMENT_OUTCOME as any, db);
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    return this.executeWithTracking(context, async () => {
      const { data } = context;
      const experiment = data?.experiment;
      if (!experiment) {
        return this.failure(new Error('No experiment provided'));
      }
      const outcome = await this.computeOutcome(experiment);
      return outcome
        ? this.success({ outcome })
        : this.failure(new Error('Insufficient data for outcome computation'));
    });
  }

  /**
   * Public — called directly by ExperimentOrchestratorAgent polling loop.
   */
  async computeOutcome(experiment: any): Promise<ExperimentOutcome | null> {
    const controlIds = this.db!.getCohortSessionIds(experiment.id, 'control');
    const variantIds = this.db!.getCohortSessionIds(experiment.id, 'variant');

    if (controlIds.length === 0 || variantIds.length === 0) return null;

    const controlMetrics = this.computeGroupMetrics(controlIds, experiment.id);
    const variantMetrics = this.computeGroupMetrics(variantIds, experiment.id);

    const uplift =
      controlMetrics.taskCompletionRate > 0
        ? (variantMetrics.taskCompletionRate - controlMetrics.taskCompletionRate) /
          controlMetrics.taskCompletionRate
        : 0;

    const confidenceScore = this.bayesianConfidence(
      variantMetrics.taskCompletionRate,
      variantIds.length,
      controlMetrics.taskCompletionRate,
      controlIds.length
    );

    const hasEnoughData =
      controlIds.length >= experiment.minSampleSize &&
      variantIds.length >= experiment.minSampleSize;

    const decision = this.makeDecision(
      confidenceScore,
      uplift,
      hasEnoughData,
      experiment.minConfidenceThreshold
    );

    return {
      id: uuidv4(),
      experimentId: experiment.id,
      measuredAt: Date.now(),
      controlSessions: controlIds.length,
      controlTaskCompletionRate: controlMetrics.taskCompletionRate,
      controlErrorRate: controlMetrics.errorRate,
      controlAbandonmentRate: controlMetrics.abandonmentRate,
      controlAvgSessionDuration: controlMetrics.avgDuration,
      variantSessions: variantIds.length,
      variantTaskCompletionRate: variantMetrics.taskCompletionRate,
      variantErrorRate: variantMetrics.errorRate,
      variantAbandonmentRate: variantMetrics.abandonmentRate,
      variantAvgSessionDuration: variantMetrics.avgDuration,
      confidenceScore,
      uplift,
      decision,
      decisionReason: this.buildReason(decision, confidenceScore, uplift, hasEnoughData),
    };
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private computeGroupMetrics(sessionIds: string[], _experimentId: string): {
    taskCompletionRate: number;
    errorRate: number;
    abandonmentRate: number;
    avgDuration: number;
  } {
    let completions = 0;
    let errors = 0;
    let abandonments = 0;
    let totalDuration = 0;

    for (const sid of sessionIds) {
      const events = this.db!.getSessionEvents(sid);
      if (events.length === 0) continue;

      const hasGoal = events.some(e => GOAL_EVENT_TYPES.includes(e.type));
      const hasError = events.some(e => e.type === 'js_error' || e.type === 'error_click');
      const duration =
        events[events.length - 1].timestamp - events[0].timestamp;

      if (hasGoal) completions++;
      if (hasError) errors++;
      if (!hasGoal) abandonments++;
      totalDuration += duration;
    }

    const n = sessionIds.length;
    return {
      taskCompletionRate: n > 0 ? completions / n : 0,
      errorRate: n > 0 ? errors / n : 0,
      abandonmentRate: n > 0 ? abandonments / n : 0,
      avgDuration: n > 0 ? totalDuration / n : 0,
    };
  }

  /**
   * Bayesian A/B test: P(variant > control) via Beta(α,β) posterior.
   * Uses Monte Carlo approximation (fast, no external dependency).
   */
  private bayesianConfidence(
    pVariant: number, nVariant: number,
    pControl: number, nControl: number
  ): number {
    if (nVariant < 5 || nControl < 5) return 0;

    // Beta distribution parameters
    const αVariant = pVariant * nVariant + 1;
    const βVariant = (1 - pVariant) * nVariant + 1;
    const αControl = pControl * nControl + 1;
    const βControl = (1 - pControl) * nControl + 1;

    // Monte Carlo: sample 5000 pairs
    const samples = 5000;
    let variantWins = 0;
    for (let i = 0; i < samples; i++) {
      const sv = this.sampleBeta(αVariant, βVariant);
      const sc = this.sampleBeta(αControl, βControl);
      if (sv > sc) variantWins++;
    }
    return variantWins / samples;
  }

  /** Sample from Beta(α, β) using the Johnk method. */
  private sampleBeta(α: number, β: number): number {
    // Use gamma sampling: Beta = Gamma(α) / (Gamma(α) + Gamma(β))
    const g1 = this.sampleGamma(α);
    const g2 = this.sampleGamma(β);
    return g1 / (g1 + g2);
  }

  /** Sample from Gamma(shape) using Marsaglia-Tsang method. */
  private sampleGamma(shape: number): number {
    if (shape < 1) {
      return this.sampleGamma(1 + shape) * Math.pow(Math.random(), 1 / shape);
    }
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    while (true) {
      let x: number;
      let v: number;
      do {
        x = this.randNormal();
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = Math.random();
      if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }

  private randNormal(): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  private makeDecision(
    confidence: number,
    uplift: number,
    hasEnoughData: boolean,
    threshold: number
  ): ExperimentOutcome['decision'] {
    if (!hasEnoughData) return 'insufficient_data';
    if (confidence >= threshold && uplift > 0) return 'promote';
    if (confidence >= threshold && uplift < -0.05) return 'revert';   // >5% degradation
    return 'continue';
  }

  private buildReason(
    decision: string,
    confidence: number,
    uplift: number,
    hasEnoughData: boolean
  ): string {
    if (!hasEnoughData) return 'Not enough sessions to make a decision.';
    if (decision === 'promote') {
      return `Variant improved task completion by ${(uplift * 100).toFixed(1)}% ` +
        `with ${(confidence * 100).toFixed(0)}% confidence.`;
    }
    if (decision === 'revert') {
      return `Variant degraded metrics by ${Math.abs(uplift * 100).toFixed(1)}% ` +
        `with ${(confidence * 100).toFixed(0)}% confidence.`;
    }
    return `Confidence ${(confidence * 100).toFixed(0)}% — continuing to collect data.`;
  }
}

export default ExperimentOutcomeAgent;
