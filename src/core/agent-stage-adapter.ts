import { Agent, AgentContext, AgentType, SessionState } from '../types';
import { BasePipelineStage, StageContext, StageResult } from './pipeline';
import { EventType } from './event-bus';

/**
 * Maps AgentType to appropriate EventTypes
 */
const AGENT_EVENT_MAP: Record<
  AgentType,
  { started: EventType; completed: EventType; failed: EventType }
> = {
  [AgentType.ORCHESTRATOR]: {
    started: EventType.SESSION_STARTED,
    completed: EventType.SESSION_COMPLETED,
    failed: EventType.SESSION_FAILED,
  },
  [AgentType.APPLICATION_LOADER]: {
    started: EventType.STAGE_STARTED,
    completed: EventType.STAGE_COMPLETED,
    failed: EventType.STAGE_FAILED,
  },
  [AgentType.ENVIRONMENT]: {
    started: EventType.STAGE_STARTED,
    completed: EventType.STAGE_COMPLETED,
    failed: EventType.STAGE_FAILED,
  },
  [AgentType.WORKFLOW_DISCOVERY]: {
    started: EventType.STAGE_STARTED,
    completed: EventType.STAGE_COMPLETED,
    failed: EventType.STAGE_FAILED,
  },
  [AgentType.TEST_GENERATION]: {
    started: EventType.TEST_GENERATION_STARTED,
    completed: EventType.TEST_GENERATION_COMPLETED,
    failed: EventType.TEST_GENERATION_FAILED,
  },
  [AgentType.EXECUTION]: {
    started: EventType.TEST_EXECUTION_STARTED,
    completed: EventType.TEST_EXECUTION_COMPLETED,
    failed: EventType.TEST_EXECUTION_FAILED,
  },
  [AgentType.ANALYSIS]: {
    started: EventType.ANALYSIS_STARTED,
    completed: EventType.ANALYSIS_COMPLETED,
    failed: EventType.ANALYSIS_FAILED,
  },
  [AgentType.DEPENDENCY_UPGRADE]: {
    started: EventType.STAGE_STARTED,
    completed: EventType.STAGE_COMPLETED,
    failed: EventType.STAGE_FAILED,
  },
  [AgentType.TEST_FIXING]: {
    started: EventType.STAGE_STARTED,
    completed: EventType.STAGE_COMPLETED,
    failed: EventType.STAGE_FAILED,
  },
  [AgentType.REMEDIATION]: {
    started: EventType.REMEDIATION_PROPOSED,
    completed: EventType.STAGE_COMPLETED,
    failed: EventType.STAGE_FAILED,
  },
  [AgentType.IMPLEMENTATION]: {
    started: EventType.STAGE_STARTED,
    completed: EventType.REMEDIATION_IMPLEMENTED,
    failed: EventType.STAGE_FAILED,
  },
  [AgentType.REVIEW]: {
    started: EventType.STAGE_STARTED,
    completed: EventType.STAGE_COMPLETED,
    failed: EventType.STAGE_FAILED,
  },
  [AgentType.EVALUATION]: {
    started: EventType.EVALUATION_STARTED,
    completed: EventType.EVALUATION_COMPLETED,
    failed: EventType.STAGE_FAILED,
  },
};

/**
 * Maps SessionState to stage dependencies
 * Defines the default pipeline flow
 */
const STATE_DEPENDENCY_MAP: Record<SessionState, string[]> = {
  [SessionState.IDLE]: [],
  [SessionState.INITIALIZING]: [],
  [SessionState.APPLICATION_LOADING]: ['INITIALIZING'],
  [SessionState.ENVIRONMENT_SETUP]: ['APPLICATION_LOADING'],
  [SessionState.WORKFLOW_DISCOVERY]: ['APPLICATION_LOADING', 'ENVIRONMENT_SETUP'],
  [SessionState.TEST_GENERATION]: ['ENVIRONMENT_SETUP', 'WORKFLOW_DISCOVERY'],
  [SessionState.TEST_EXECUTION]: ['TEST_GENERATION'],
  [SessionState.ANALYSIS]: ['TEST_EXECUTION'],
  [SessionState.DEPENDENCY_UPGRADE]: ['ANALYSIS'],
  [SessionState.TEST_FIXING]: ['DEPENDENCY_UPGRADE'],
  [SessionState.REMEDIATION_PROPOSAL]: ['ANALYSIS'],
  [SessionState.AWAITING_APPROVAL]: ['REMEDIATION_PROPOSAL'],
  [SessionState.IMPLEMENTING]: ['AWAITING_APPROVAL'],
  [SessionState.REVIEWING]: ['IMPLEMENTING'],
  [SessionState.EVALUATION]: ['REVIEWING', 'ANALYSIS'],
  [SessionState.COMPLETE]: ['EVALUATION'],
  [SessionState.ERROR]: [],
};

/**
 * Adapter that wraps existing Agent into PipelineStage
 * Maintains backward compatibility while adding event emission
 */
export class AgentStageAdapter extends BasePipelineStage {
  private agent: Agent;
  private eventMap: { started: EventType; completed: EventType; failed: EventType };
  private inputDataKey?: string;

  constructor(
    agent: Agent,
    options?: {
      dependencies?: string[];
      canRunInParallel?: boolean;
      inputDataKey?: string;
    }
  ) {
    super(
      agent.type,
      options?.dependencies || STATE_DEPENDENCY_MAP[SessionState.IDLE] || [],
      options?.canRunInParallel || false
    );

    this.agent = agent;
    this.eventMap = AGENT_EVENT_MAP[agent.type];
    this.inputDataKey = options?.inputDataKey;
  }

  async execute(context: StageContext): Promise<StageResult> {
    const startTime = Date.now();

    try {
      // Emit started event
      context.emit(this.eventMap.started, null, {
        stageName: this.name,
        agentType: this.agent.type,
      });

      // Prepare agent context from stage context
      const agentData: Record<string, any> = this.inputDataKey
        ? { [this.inputDataKey]: context.get(this.inputDataKey) }
        : context.toObject();

      if (
        this.agent.type === AgentType.EXECUTION &&
        agentData?.[AgentType.TEST_GENERATION]?.testSuites &&
        !agentData.testSuites
      ) {
        agentData.testSuites = agentData[AgentType.TEST_GENERATION].testSuites;
      }

      const agentContext = context.createAgentContext(agentData);

      // Execute agent
      const result = await context.resilience.execute(
        this.agent.type,
        () => this.agent.execute(agentContext)
      );

      const duration = Date.now() - startTime;

      if (!result.success) {
        // Emit failed event
        context.emit(this.eventMap.failed, {
          error: result.error?.message,
          duration,
        }, {
          stageName: this.name,
          agentType: this.agent.type,
        });

        return this.failure(
          result.error || new Error(`Agent ${this.agent.type} failed`),
          { duration }
        );
      }

      // Emit completed event
      context.emit(this.eventMap.completed, {
        duration,
        ...result.data,
      }, {
        stageName: this.name,
        agentType: this.agent.type,
      });

      return this.success(result.data, { duration });
    } catch (error) {
      const duration = Date.now() - startTime;

      // Emit failed event
      context.emit(this.eventMap.failed, {
        error: (error as Error).message,
        duration,
      }, {
        stageName: this.name,
        agentType: this.agent.type,
      });

      if ((error as Error).message.includes('Circuit open')) {
        context.layers.recordRepairNote('Circuit breaker triggered', {
          agentType: this.agent.type,
          stage: this.name,
        });
      }

      return this.failure(error as Error, { duration });
    }
  }
}

/**
 * Factory to create pipeline stages from agents
 */
export class AgentPipelineFactory {
  /**
   * Create a stage from an agent
   */
  static createStage(
    agent: Agent,
    options?: {
      dependencies?: string[];
      canRunInParallel?: boolean;
      inputDataKey?: string;
    }
  ): AgentStageAdapter {
    return new AgentStageAdapter(agent, options);
  }

  /**
   * Create default pipeline from agents
   * This represents the current orchestrator flow
   */
  static createDefaultPipeline(agents: Map<AgentType, Agent>): AgentStageAdapter[] {
    const stages: AgentStageAdapter[] = [];

    // Application Loading (if configured)
    const appLoader = agents.get(AgentType.APPLICATION_LOADER);
    if (appLoader) {
      stages.push(
        this.createStage(appLoader, {
          dependencies: [],
        })
      );
    }

    // Environment Setup
    const env = agents.get(AgentType.ENVIRONMENT);
    if (env) {
      stages.push(
        this.createStage(env, {
          dependencies: appLoader ? [AgentType.APPLICATION_LOADER] : [],
        })
      );
    }

    // Workflow Discovery
    const workflow = agents.get(AgentType.WORKFLOW_DISCOVERY);
    if (workflow) {
      stages.push(
        this.createStage(workflow, {
          dependencies: env
            ? [AgentType.ENVIRONMENT]
            : appLoader
            ? [AgentType.APPLICATION_LOADER]
            : [],
        })
      );
    }

    // Test Generation
    const testGen = agents.get(AgentType.TEST_GENERATION);
    if (testGen) {
      const testGenDependencies = workflow
        ? [AgentType.WORKFLOW_DISCOVERY]
        : env
        ? [AgentType.ENVIRONMENT]
        : appLoader
        ? [AgentType.APPLICATION_LOADER]
        : [];
      stages.push(
        this.createStage(testGen, {
          dependencies: testGenDependencies,
        })
      );
    }

    // Test Execution
    const execution = agents.get(AgentType.EXECUTION);
    if (execution) {
      stages.push(
        this.createStage(execution, {
          dependencies: testGen ? [AgentType.TEST_GENERATION] : [],
        })
      );
    }

    // Analysis
    const analysis = agents.get(AgentType.ANALYSIS);
    if (analysis) {
      stages.push(
        this.createStage(analysis, {
          dependencies: execution ? [AgentType.EXECUTION] : [],
        })
      );
    }

    // Dependency Upgrade (if application mode)
    const depUpgrade = agents.get(AgentType.DEPENDENCY_UPGRADE);
    if (depUpgrade) {
      stages.push(
        this.createStage(depUpgrade, {
          dependencies: analysis ? [AgentType.ANALYSIS] : [],
        })
      );
    }

    // Test Fixing (if application mode)
    const testFix = agents.get(AgentType.TEST_FIXING);
    if (testFix) {
      stages.push(
        this.createStage(testFix, {
          dependencies: depUpgrade ? [AgentType.DEPENDENCY_UPGRADE] : [],
        })
      );
    }

    // Remediation
    const remediation = agents.get(AgentType.REMEDIATION);
    if (remediation) {
      stages.push(
        this.createStage(remediation, {
          dependencies: analysis ? [AgentType.ANALYSIS] : [],
        })
      );
    }

    // Implementation
    const implementation = agents.get(AgentType.IMPLEMENTATION);
    if (implementation) {
      stages.push(
        this.createStage(implementation, {
          dependencies: remediation ? [AgentType.REMEDIATION] : [],
        })
      );
    }

    // Review
    const review = agents.get(AgentType.REVIEW);
    if (review) {
      stages.push(
        this.createStage(review, {
          dependencies: implementation ? [AgentType.IMPLEMENTATION] : [],
        })
      );
    }

    // Evaluation
    const evaluation = agents.get(AgentType.EVALUATION);
    if (evaluation) {
      stages.push(
        this.createStage(evaluation, {
          dependencies: review ? [AgentType.REVIEW] : analysis ? [AgentType.ANALYSIS] : [],
        })
      );
    }

    return stages;
  }
}

export default AgentStageAdapter;
