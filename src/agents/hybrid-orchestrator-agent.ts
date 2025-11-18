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
    this.agents.set(AgentType.APPLICATION_LOADER, new ApplicationLoaderAgent());
    this.agents.set(AgentType.ENVIRONMENT, new EnvironmentAgent());
    this.agents.set(AgentType.TEST_GENERATION, new TestGenerationAgent());
    this.agents.set(AgentType.EXECUTION, new ExecutionAgent());
    this.agents.set(AgentType.ANALYSIS, new AnalysisAgent());
    this.agents.set(AgentType.DEPENDENCY_UPGRADE, new DependencyUpgradeAgent());
    this.agents.set(AgentType.TEST_FIXING, new TestFixingAgent());
    this.agents.set(AgentType.REMEDIATION, new RemediationAgent());
    this.agents.set(AgentType.IMPLEMENTATION, new ImplementationAgent());
    this.agents.set(AgentType.REVIEW, new ReviewAgent());
    this.agents.set(AgentType.EVALUATION, new EvaluationAgent(this.database));
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
      const { stageName, duration } = event.metadata || {};
      this.logger.info(
        `✓ Stage completed: ${stageName} (${duration}ms)`
      );
    });

    this.eventBus.on(EventType.STAGE_FAILED, (event) => {
      const { stageName } = event.metadata || {};
      const { error } = event.data || {};
      this.logger.error(
        `✗ Stage failed: ${stageName} - ${error}`
      );
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
}

export default HybridOrchestratorAgent;
