import { BaseAgent } from './base-agent';
import { AgentType, AgentContext, AgentResult } from '../types';
import { ExecutionAgent } from './execution-agent';

/**
 * Review Agent - Validates implementations
 *
 * Responsibilities:
 * - Re-run tests post-implementation
 * - Verify fix effectiveness
 * - Check for regression introduction
 * - Generate sign-off reports
 */
export class ReviewAgent extends BaseAgent {
  private executionAgent: ExecutionAgent;

  constructor() {
    super(AgentType.REVIEW);
    this.executionAgent = new ExecutionAgent();
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const { session, data } = context;
    const implementations = data?.implementations || [];

    try {
      this.logger.info('Reviewing implementations');

      if (implementations.length === 0) {
        return this.success({
          passed: true,
          message: 'No implementations to review',
        });
      }

      // Re-run tests to verify fixes
      const testResults = await this.executionAgent.execute({
        ...context,
        data: {
          ...data,
          testSuites: data?.testSuites || [],
        },
      });

      if (!testResults.success) {
        return this.success({
          passed: false,
          message: 'Tests failed after implementation',
          testResults: testResults.data,
        });
      }

      // Check if differences are resolved
      const stillHasDifferences = await this.checkForRemainingDifferences(
        testResults.data,
        context
      );

      if (stillHasDifferences) {
        return this.success({
          passed: false,
          message: 'Some differences still exist after implementation',
          requiresIteration: true,
        });
      }

      this.logger.info('All implementations verified successfully');

      return this.success({
        passed: true,
        message: 'All implementations verified and tests pass',
        testResults: testResults.data,
      });
    } catch (error) {
      return this.failure(error as Error);
    }
  }

  private async checkForRemainingDifferences(
    testResults: any,
    context: AgentContext
  ): Promise<boolean> {
    // In a real implementation, we would re-run the analysis agent
    // For now, we check if tests pass
    const failedTests = testResults.results?.filter((r: any) => r.status === 'failed') || [];
    return failedTests.length > 0;
  }
}

export default ReviewAgent;
