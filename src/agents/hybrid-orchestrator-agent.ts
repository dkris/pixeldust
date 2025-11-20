import { BaseAgent } from './base-agent';
import { AgentType, AgentContext, AgentResult, SessionState } from '../types';
import { DatabaseManager } from '../storage/database';
import { ApplicationLoaderAgent } from './application-loader-agent';
import { EnvironmentAgent } from './environment-agent';
import { TestGenerationAgent } from './test-generation-agent';
import { ExecutionAgent } from './execution-agent';
import { AnalysisAgent } from './analysis-agent';
import { DependencyUpgradeAgent } from './dependency-upgrade-agent';
import { TestFixingAgent } from './test-fixing-agent';
import { RemediationAgent } from './remediation-agent';
import { ImplementationAgent } from './implementation-agent';
import { ReviewAgent } from './review-agent';
import { EvaluationAgent } from './evaluation-agent';
import { EventBus, EventType } from '../core/event-bus';
import { PipelineExecutor, StageContext } from '../core/pipeline';
import { AgentPipelineFactory } from '../core/agent-stage-adapter';
import { OrchestratorAgent } from './orchestrator-agent';
import { WorkflowDiscoveryAgent } from './workflow-discovery-agent';

/**
 * Hybrid Orchestrator Agent
 *
 * Uses Pipeline-based architecture with Event layer for:
 * - Clear workflow structure (Pipeline)
 * - Real-time feedback (Events)
 * - Continuous evaluation (Event handlers)
 * - Parallel execution where possible
 *
 * Maintains backward compatibility with state machine approach
 */
export class HybridOrchestratorAgent extends BaseAgent {
  private readonly database: DatabaseManager;
  private agents: Map<AgentType, BaseAgent>;
  private eventBus: EventBus;
  private pipelineExecutor: PipelineExecutor;
  private usePipeline: boolean;
  private legacyOrchestrator: OrchestratorAgent;

  constructor(db: DatabaseManager, options?: { usePipeline?: boolean }) {
    super(AgentType.ORCHESTRATOR, db);
    this.database = db;
    this.agents = new Map();
    this.eventBus = new EventBus({ db });
    this.pipelineExecutor = new PipelineExecutor(this.eventBus);
    this.usePipeline = options?.usePipeline !== false; // Default to pipeline mode
    this.legacyOrchestrator = new OrchestratorAgent(db);

    this.initializeAgents();
    this.setupEventHandlers();
  }

  private initializeAgents() {
    const db = this.database;

    this.agents.set(AgentType.APPLICATION_LOADER, new ApplicationLoaderAgent(db));
    this.agents.set(AgentType.ENVIRONMENT, new EnvironmentAgent(db));
    this.agents.set(AgentType.WORKFLOW_DISCOVERY, new WorkflowDiscoveryAgent(db));
    this.agents.set(AgentType.TEST_GENERATION, new TestGenerationAgent(db));
    this.agents.set(AgentType.EXECUTION, new ExecutionAgent(db));
    this.agents.set(AgentType.ANALYSIS, new AnalysisAgent(db));
    this.agents.set(AgentType.DEPENDENCY_UPGRADE, new DependencyUpgradeAgent(db));
    this.agents.set(AgentType.TEST_FIXING, new TestFixingAgent(db));
    this.agents.set(AgentType.REMEDIATION, new RemediationAgent(db));
    this.agents.set(AgentType.IMPLEMENTATION, new ImplementationAgent(db));
    this.agents.set(AgentType.REVIEW, new ReviewAgent(db));
    this.agents.set(AgentType.EVALUATION, new EvaluationAgent(db));
  }

  /**
   * Setup event handlers for continuous evaluation and monitoring
   * This is the "Event Layer" of the hybrid architecture
   */
  private setupEventHandlers() {
    // Real-time test quality feedback
    this.eventBus.on(EventType.TEST_GENERATION_COMPLETED, async (event) => {
      const { testCount, duration, component } = event.data || {};

      if (testCount < 3) {
        this.logger.warn(
          `⚠️  Low test coverage for ${component}: only ${testCount} tests`
        );
        this.eventBus.emit({
          type: EventType.LOW_TEST_COVERAGE,
          sessionId: event.sessionId,
          timestamp: Date.now(),
          data: { component, testCount },
        });
      }

      if (duration > 30000) {
        this.logger.warn(
          `⚠️  Slow test generation for ${component}: ${duration}ms`
        );
        this.eventBus.emit({
          type: EventType.SLOW_PERFORMANCE,
          sessionId: event.sessionId,
          timestamp: Date.now(),
          data: { component, duration, stage: 'test-generation' },
        });
      }
    });

    // Real-time execution monitoring
    this.eventBus.on(EventType.TEST_EXECUTION_COMPLETED, async (event) => {
      const { failureRate, component } = event.data || {};

      if (failureRate && failureRate > 0.3) {
        this.logger.warn(
          `⚠️  High failure rate for ${component}: ${(failureRate * 100).toFixed(1)}%`
        );
        this.eventBus.emit({
          type: EventType.HIGH_FAILURE_RATE,
          sessionId: event.sessionId,
          timestamp: Date.now(),
          data: { component, failureRate },
        });
      }
    });

    // Progress logging
    this.eventBus.on(EventType.STAGE_COMPLETED, (event) => {
      const { stageName } = event.metadata || {};
      const { duration } = event.data || {};
      this.logger.info(
        `✓ Stage completed: ${stageName} (${duration ?? 'unknown'}ms)`
      );
    });

    this.eventBus.on(EventType.STAGE_FAILED, (event) => {
      const { stageName } = event.metadata || {};
      const { error } = event.data || {};
      this.logger.error(
        `✗ Stage failed: ${stageName} - ${error}`
      );
    });

    // Save snapshots after execution stage
    this.eventBus.on(EventType.STAGE_COMPLETED, async (event) => {
      const { stageName } = event.metadata || {};

      if (stageName === 'EXECUTION' && event.data?.results) {
        await this.saveSnapshotsFromExecution(event.sessionId, event.data);
      }
    });

    // Save snapshot comparisons after analysis stage
    this.eventBus.on(EventType.STAGE_COMPLETED, async (event) => {
      const { stageName } = event.metadata || {};

      if (stageName === 'ANALYSIS' && event.data?.comparisons) {
        // Get session to access versions
        const session = this.database.getSession(event.sessionId);
        if (session) {
          // Get execution results from previous stage context
          const executionResults = await this.getExecutionResults(event.sessionId);
          if (executionResults && executionResults.length > 0) {
            await this.saveSnapshotComparisons(
              event.sessionId,
              session.versions,
              executionResults,
              event.data.comparisons
            );
          }
        }
      }
    });
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    if (this.usePipeline) {
      return this.executePipeline(context);
    } else {
      // Fallback to state machine (for backward compatibility)
      return this.executeStateMachine(context);
    }
  }

  /**
   * Execute using Pipeline architecture
   */
  private async executePipeline(context: AgentContext): Promise<AgentResult> {
    const { session, config } = context;

    try {
      this.logger.info(
        `Executing pipeline for session ${session.id} (Hybrid Architecture)`
      );

      // Create pipeline stages from agents
      const stages = AgentPipelineFactory.createDefaultPipeline(this.agents);

      // Validate pipeline
      const validation = this.pipelineExecutor.validate(stages);
      if (!validation.valid) {
        throw new Error(
          `Pipeline validation failed: ${validation.errors.join(', ')}`
        );
      }

      // Create initial stage context
      const stageContext = new StageContext(
        session,
        config,
        this.eventBus
      );

      // Execute pipeline
      const result = await this.pipelineExecutor.execute(stages, stageContext);

      if (!result.success) {
        this.logger.error(
          `Pipeline failed at stage: ${result.failedStage}`,
          result.error!
        );

        // Update session state
        this.database.updateSessionState(session.id, SessionState.ERROR);

        return this.failure(
          result.error || new Error('Pipeline execution failed'),
          SessionState.ERROR
        );
      }

      this.logger.info(
        `Pipeline completed successfully in ${result.totalDuration}ms`
      );

      // Update session state
      this.database.updateSessionState(session.id, SessionState.COMPLETE);

      return this.success(
        {
          executedStages: result.executedStages,
          totalDuration: result.totalDuration,
          finalContext: result.finalContext.toObject(),
        },
        SessionState.COMPLETE
      );
    } catch (error) {
      this.logger.error('Pipeline execution error', error as Error);
      this.database.updateSessionState(session.id, SessionState.ERROR);
      return this.failure(error as Error, SessionState.ERROR);
    }
  }

  /**
   * Execute using State Machine (fallback/backward compatibility)
   */
  private async executeStateMachine(context: AgentContext): Promise<AgentResult> {
    const { session } = context;

    this.logger.info(
      `Executing state machine for session ${session.id} (Legacy Mode)`
    );

    // Delegate to original state machine implementation
    return this.legacyOrchestrator.execute(context);
  }

  async approveRemediation(sessionId: string, remediationId: string): Promise<void> {
    return this.legacyOrchestrator.approveRemediation(sessionId, remediationId);
  }

  /**
   * Get event bus for external listeners
   */
  getEventBus(): EventBus {
    return this.eventBus;
  }

  /**
   * Get event statistics
   */
  getEventStats() {
    return this.eventBus.getStats();
  }

  /**
   * Get event history for session
   */
  getSessionHistory(sessionId: string) {
    return this.eventBus.getHistory({ sessionId });
  }

  /**
   * Save snapshots from execution stage results
   */
  private async saveSnapshotsFromExecution(sessionId: string, data: any): Promise<void> {
    if (!data.results || !Array.isArray(data.results)) {
      return;
    }

    try {
      const session = this.database.getSession(sessionId);
      if (!session) {
        this.logger.warn(`Session ${sessionId} not found, skipping snapshot save`);
        return;
      }

      for (const testResult of data.results) {
        // Save test result to database
        this.database.saveTestResult(testResult);

        // Create and save snapshots from test results
        for (const screenshot of testResult.screenshots || []) {
          const snapshot = {
            id: screenshot.id,
            sessionId: testResult.sessionId,
            version: testResult.version,
            component: testResult.testId, // Use testId as component identifier
            url: `test://${testResult.testId}`,
            viewport: session.config.testing?.viewport || { width: 1920, height: 1080 },
            screenshotPath: screenshot.path,
            domSnapshot: testResult.domSnapshot || null,
            computedStyles: null,
            metrics: testResult.metrics || null,
            timestamp: Date.now(),
          };

          this.database.saveSnapshot(snapshot);
        }
      }

      this.logger.info(`Saved ${data.results.length} test results and snapshots to database`);
    } catch (error) {
      this.logger.error('Failed to save snapshots from execution', error as Error);
    }
  }

  /**
   * Get execution results for a session (from test_runs table)
   */
  private async getExecutionResults(sessionId: string): Promise<any[] | null> {
    try {
      // Get test results from database
      const testResults = this.database.getTestResults(sessionId);
      return testResults;
    } catch (error) {
      this.logger.error('Failed to get execution results', error as Error);
      return null;
    }
  }

  /**
   * Create and save snapshot comparisons from analysis results
   * (Ported from OrchestratorAgent for hybrid architecture)
   */
  private async saveSnapshotComparisons(
    sessionId: string,
    versions: string[],
    testResults: any[],
    comparisons: any[]
  ): Promise<void> {
    try {
      const baseVersion = versions[0];

      for (let i = 1; i < versions.length; i++) {
        const targetVersion = versions[i];

        // Get snapshots for base and target versions
        const baseSnapshots = this.database.getSnapshots(sessionId, baseVersion);
        const targetSnapshots = this.database.getSnapshots(sessionId, targetVersion);

        // Group snapshots by component (testId)
        const snapshotsByComponent = new Map<string, { base: any[], target: any[] }>();

        for (const baseSnapshot of baseSnapshots) {
          if (!snapshotsByComponent.has(baseSnapshot.component)) {
            snapshotsByComponent.set(baseSnapshot.component, { base: [], target: [] });
          }
          snapshotsByComponent.get(baseSnapshot.component)!.base.push(baseSnapshot);
        }

        for (const targetSnapshot of targetSnapshots) {
          if (!snapshotsByComponent.has(targetSnapshot.component)) {
            snapshotsByComponent.set(targetSnapshot.component, { base: [], target: [] });
          }
          snapshotsByComponent.get(targetSnapshot.component)!.target.push(targetSnapshot);
        }

        // Create comparisons for matching components
        for (const [component, snapshots] of snapshotsByComponent.entries()) {
          if (snapshots.base.length > 0 && snapshots.target.length > 0) {
            // Use first snapshot from each version for comparison
            const baseSnapshot = snapshots.base[0];
            const targetSnapshot = snapshots.target[0];

            // Find visual diff data from analysis results
            const comparison = comparisons.find(c =>
              c.baseVersion === baseVersion && c.targetVersion === targetVersion
            );

            const visualDiff = comparison?.differences.find((d: any) =>
              d.type === 'VISUAL' && d.location?.includes(component)
            );

            const snapshotComparison = {
              id: `${baseSnapshot.id}-${targetSnapshot.id}`,
              sessionId,
              baseSnapshotId: baseSnapshot.id,
              targetSnapshotId: targetSnapshot.id,
              component,
              visualDiff: visualDiff?.visualDiff || null,
              domDiff: null,
              styleDiff: null,
              similarityScore: visualDiff?.visualDiff
                ? 100 - visualDiff.visualDiff.pixelDiffPercentage
                : 100,
              differencesFound: visualDiff ? 1 : 0,
              verdict: visualDiff ? 'DIFFERENCES_DETECTED' : 'IDENTICAL',
              timestamp: Date.now(),
            };

            this.database.saveSnapshotComparison(snapshotComparison);
          }
        }
      }

      this.logger.info('Saved snapshot comparisons to database');
    } catch (error) {
      this.logger.error('Failed to save snapshot comparisons', error as Error);
    }
  }
}

export default HybridOrchestratorAgent;
