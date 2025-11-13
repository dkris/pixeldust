import { BaseAgent } from './base-agent';
import { AgentType, AgentContext, AgentResult, SessionState, Session } from '../types';
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

/**
 * Orchestrator Agent - Main coordinator for the entire testing lifecycle
 *
 * Responsibilities:
 * - Manage state machine transitions
 * - Coordinate all specialized agents
 * - Handle error recovery
 * - Manage user interactions
 */
export class OrchestratorAgent extends BaseAgent {
  private db: DatabaseManager;
  private agents: Map<AgentType, BaseAgent>;

  constructor(db: DatabaseManager) {
    super(AgentType.ORCHESTRATOR);
    this.db = db;
    this.agents = new Map();
    this.initializeAgents();
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
    this.agents.set(AgentType.EVALUATION, new EvaluationAgent(this.db));
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const { session } = context;

    try {
      this.logger.info(`Orchestrating session ${session.id} in state ${session.state}`);

      // State machine execution
      switch (session.state) {
        case SessionState.IDLE:
          return this.handleIdle(context);

        case SessionState.INITIALIZING:
          return this.handleInitializing(context);

        case SessionState.APPLICATION_LOADING:
          return this.handleApplicationLoading(context);

        case SessionState.ENVIRONMENT_SETUP:
          return this.handleEnvironmentSetup(context);

        case SessionState.TEST_GENERATION:
          return this.handleTestGeneration(context);

        case SessionState.TEST_EXECUTION:
          return this.handleTestExecution(context);

        case SessionState.ANALYSIS:
          return this.handleAnalysis(context);

        case SessionState.DEPENDENCY_UPGRADE:
          return this.handleDependencyUpgrade(context);

        case SessionState.TEST_FIXING:
          return this.handleTestFixing(context);

        case SessionState.REMEDIATION_PROPOSAL:
          return this.handleRemediationProposal(context);

        case SessionState.AWAITING_APPROVAL:
          return this.handleAwaitingApproval(context);

        case SessionState.IMPLEMENTING:
          return this.handleImplementing(context);

        case SessionState.REVIEWING:
          return this.handleReviewing(context);

        case SessionState.EVALUATION:
          return this.handleEvaluation(context);

        case SessionState.COMPLETE:
          return this.handleComplete(context);

        case SessionState.ERROR:
          return this.handleError(context);

        default:
          throw new Error(`Unknown state: ${session.state}`);
      }
    } catch (error) {
      return this.handleException(context, error as Error);
    }
  }

  private async handleIdle(context: AgentContext): Promise<AgentResult> {
    this.logger.info('Starting new session');
    return this.success(
      { message: 'Session initialized' },
      SessionState.INITIALIZING
    );
  }

  private async handleInitializing(context: AgentContext): Promise<AgentResult> {
    this.logger.info('Initializing session');

    // Validate configuration
    const { config } = context;

    if (!config.framework.versions || config.framework.versions.length < 2) {
      throw new Error('At least 2 versions are required for comparison');
    }

    // Create session in database
    this.db.createSession(context.session);

    // Decide next state based on configuration
    const nextState = config.application
      ? SessionState.APPLICATION_LOADING
      : SessionState.ENVIRONMENT_SETUP;

    this.logger.info(`Mode: ${config.application ? 'application' : 'framework-only'}`);

    return this.success(
      { message: 'Session initialized successfully' },
      nextState
    );
  }

  private async handleApplicationLoading(context: AgentContext): Promise<AgentResult> {
    this.logger.info('Loading application');

    const appLoaderAgent = this.agents.get(AgentType.APPLICATION_LOADER)!;
    const result = await appLoaderAgent.execute(context);

    if (!result.success) {
      return this.failure(result.error!, SessionState.ERROR);
    }

    return this.success(
      result.data,
      SessionState.TEST_GENERATION
    );
  }

  private async handleEnvironmentSetup(context: AgentContext): Promise<AgentResult> {
    this.logger.info('Setting up environments');

    const envAgent = this.agents.get(AgentType.ENVIRONMENT)!;
    const result = await envAgent.execute(context);

    if (!result.success) {
      return this.failure(result.error!, SessionState.ERROR);
    }

    return this.success(
      result.data,
      SessionState.TEST_GENERATION
    );
  }

  private async handleTestGeneration(context: AgentContext): Promise<AgentResult> {
    this.logger.info('Generating tests');

    const testGenAgent = this.agents.get(AgentType.TEST_GENERATION)!;
    const result = await testGenAgent.execute(context);

    if (!result.success) {
      return this.failure(result.error!, SessionState.ERROR);
    }

    // Save generated test suites to database
    if (result.data?.testSuites) {
      for (const testSuite of result.data.testSuites) {
        this.db.saveTestSuite(testSuite);
      }
      this.logger.info(`Saved ${result.data.testSuites.length} test suites to database`);
    }

    return this.success(
      result.data,
      SessionState.TEST_EXECUTION
    );
  }

  private async handleTestExecution(context: AgentContext): Promise<AgentResult> {
    this.logger.info('Executing tests');

    const execAgent = this.agents.get(AgentType.EXECUTION)!;
    const result = await execAgent.execute(context);

    if (!result.success) {
      return this.failure(result.error!, SessionState.ERROR);
    }

    // Save test results to database
    if (result.data?.results) {
      for (const testResult of result.data.results) {
        this.db.saveTestResult(testResult);
      }
      this.logger.info(`Saved ${result.data.results.length} test results to database`);
      this.logger.info(`Pass: ${result.data.passed}, Fail: ${result.data.failed}, Skip: ${result.data.skipped}`);
    }

    return this.success(
      result.data,
      SessionState.ANALYSIS
    );
  }

  private async handleAnalysis(context: AgentContext): Promise<AgentResult> {
    this.logger.info('Analyzing differences');

    const analysisAgent = this.agents.get(AgentType.ANALYSIS)!;
    const result = await analysisAgent.execute(context);

    if (!result.success) {
      return this.failure(result.error!, SessionState.ERROR);
    }

    // If no differences found, proceed to evaluation
    if (result.data.differences.length === 0) {
      return this.success(
        { message: 'No differences found between versions' },
        SessionState.EVALUATION
      );
    }

    // If application mode, proceed to dependency upgrade
    const nextState = context.config.application
      ? SessionState.DEPENDENCY_UPGRADE
      : SessionState.REMEDIATION_PROPOSAL;

    return this.success(
      result.data,
      nextState
    );
  }

  private async handleDependencyUpgrade(context: AgentContext): Promise<AgentResult> {
    this.logger.info('Upgrading dependencies');

    const depUpgradeAgent = this.agents.get(AgentType.DEPENDENCY_UPGRADE)!;
    const result = await depUpgradeAgent.execute(context);

    if (!result.success) {
      return this.failure(result.error!, SessionState.ERROR);
    }

    return this.success(
      result.data,
      SessionState.TEST_FIXING
    );
  }

  private async handleTestFixing(context: AgentContext): Promise<AgentResult> {
    this.logger.info('Fixing broken tests');

    const testFixingAgent = this.agents.get(AgentType.TEST_FIXING)!;
    const result = await testFixingAgent.execute(context);

    if (!result.success) {
      return this.failure(result.error!, SessionState.ERROR);
    }

    // If all tests pass, go to remediation proposal
    // Otherwise, may need another iteration
    return this.success(
      result.data,
      SessionState.REMEDIATION_PROPOSAL
    );
  }

  private async handleRemediationProposal(context: AgentContext): Promise<AgentResult> {
    this.logger.info('Generating remediation proposals');

    const remediationAgent = this.agents.get(AgentType.REMEDIATION)!;
    const result = await remediationAgent.execute(context);

    if (!result.success) {
      return this.failure(result.error!, SessionState.ERROR);
    }

    return this.success(
      result.data,
      SessionState.AWAITING_APPROVAL
    );
  }

  private async handleAwaitingApproval(context: AgentContext): Promise<AgentResult> {
    this.logger.info('Awaiting user approval');

    // This state is handled by CLI/UI - return current state
    return this.success(
      { message: 'Waiting for user approval' },
      SessionState.AWAITING_APPROVAL
    );
  }

  private async handleImplementing(context: AgentContext): Promise<AgentResult> {
    this.logger.info('Implementing approved remediations');

    const implAgent = this.agents.get(AgentType.IMPLEMENTATION)!;
    const result = await implAgent.execute(context);

    if (!result.success) {
      return this.failure(result.error!, SessionState.ERROR);
    }

    return this.success(
      result.data,
      SessionState.REVIEWING
    );
  }

  private async handleReviewing(context: AgentContext): Promise<AgentResult> {
    this.logger.info('Reviewing implementations');

    const reviewAgent = this.agents.get(AgentType.REVIEW)!;
    const result = await reviewAgent.execute(context);

    if (!result.success) {
      return this.failure(result.error!, SessionState.ERROR);
    }

    // If review passes, proceed to evaluation; otherwise, go back to analysis
    if (result.data.passed) {
      return this.success(
        result.data,
        SessionState.EVALUATION
      );
    } else {
      return this.success(
        result.data,
        SessionState.ANALYSIS
      );
    }
  }

  private async handleEvaluation(context: AgentContext): Promise<AgentResult> {
    this.logger.info('Evaluating session performance and generating feedback');

    const evaluationAgent = this.agents.get(AgentType.EVALUATION)!;
    const result = await evaluationAgent.execute(context);

    if (!result.success) {
      this.logger.warn('Evaluation failed, but continuing to completion');
      // Even if evaluation fails, we should complete the session
      return this.success(
        { message: 'Evaluation failed but session completed' },
        SessionState.COMPLETE
      );
    }

    this.logger.info('Evaluation completed successfully');

    // Log key recommendations
    if (result.data.evaluation?.feedback?.recommendations) {
      const highPriorityRecs = result.data.evaluation.feedback.recommendations
        .filter((r: any) => r.priority === 'high' && r.actionable);

      if (highPriorityRecs.length > 0) {
        this.logger.info(`Found ${highPriorityRecs.length} high-priority actionable recommendations`);
      }
    }

    return this.success(
      result.data,
      SessionState.COMPLETE
    );
  }

  private async handleComplete(context: AgentContext): Promise<AgentResult> {
    this.logger.info('Session completed successfully');

    return this.success({
      message: 'Session completed successfully',
      sessionId: context.session.id,
    });
  }

  private async handleError(context: AgentContext): Promise<AgentResult> {
    this.logger.error('Session in error state');

    return this.failure(
      new Error('Session encountered an error'),
      SessionState.ERROR
    );
  }

  private handleException(context: AgentContext, error: Error): AgentResult {
    this.logger.error('Unhandled exception in orchestrator', error);

    // Update session state to ERROR
    this.db.updateSessionState(context.session.id, SessionState.ERROR);

    return this.failure(error, SessionState.ERROR);
  }

  /**
   * Approve a remediation and transition to IMPLEMENTING state
   */
  async approveRemediation(sessionId: string, remediationId: string): Promise<void> {
    this.logger.info(`Approving remediation ${remediationId} for session ${sessionId}`);
    this.db.updateSessionState(sessionId, SessionState.IMPLEMENTING);
  }

  /**
   * Reject a remediation and go back to REMEDIATION_PROPOSAL
   */
  async rejectRemediation(sessionId: string, remediationId: string, reason?: string): Promise<void> {
    this.logger.info(`Rejecting remediation ${remediationId} for session ${sessionId}`, { reason });
    this.db.updateSessionState(sessionId, SessionState.REMEDIATION_PROPOSAL);
  }
}

export default OrchestratorAgent;
