import { EventBus, EventType, EventPayload } from '../core/event-bus';
import { DatabaseManager } from '../storage/database';
import Logger from '../utils/logger';

/**
 * Continuous Evaluation Agent
 *
 * Runs asynchronously via event layer to provide real-time feedback
 * during pipeline execution. Does not block the main workflow.
 *
 * Monitors:
 * - Test generation quality
 * - Test execution results
 * - Comparison accuracy
 * - Performance metrics
 *
 * Provides:
 * - Immediate warnings for issues
 * - Continuous metrics collection
 * - Adaptive suggestions
 * - Real-time dashboard updates
 */
export class ContinuousEvaluationAgent {
  private eventBus: EventBus;
  private db: DatabaseManager;
  private logger: Logger;
  private sessionMetrics: Map<string, SessionMetrics>;

  constructor(eventBus: EventBus, db: DatabaseManager) {
    this.eventBus = eventBus;
    this.db = db;
    this.logger = new Logger('CONTINUOUS_EVALUATION');
    this.sessionMetrics = new Map();

    this.setupSubscriptions();
  }

  /**
   * Subscribe to relevant events
   */
  private setupSubscriptions(): void {
    // Test Generation Monitoring
    this.eventBus.on(
      EventType.TEST_GENERATION_COMPLETED,
      this.onTestGenerated.bind(this)
    );

    // Test Execution Monitoring
    this.eventBus.on(
      EventType.TEST_EXECUTION_COMPLETED,
      this.onTestExecuted.bind(this)
    );

    // Analysis Monitoring
    this.eventBus.on(
      EventType.ANALYSIS_COMPLETED,
      this.onAnalysisComplete.bind(this)
    );

    // Comparison Monitoring
    this.eventBus.on(
      EventType.COMPARISON_COMPLETED,
      this.onComparisonComplete.bind(this)
    );

    // Session Lifecycle
    this.eventBus.on(
      EventType.SESSION_STARTED,
      this.onSessionStarted.bind(this)
    );

    this.eventBus.on(
      EventType.SESSION_COMPLETED,
      this.onSessionCompleted.bind(this)
    );
  }

  /**
   * Initialize metrics for new session
   */
  private async onSessionStarted(event: EventPayload): Promise<void> {
    const { sessionId } = event;

    this.sessionMetrics.set(sessionId, {
      testGeneration: {
        totalComponents: 0,
        totalTests: 0,
        totalDuration: 0,
        lowCoverageComponents: [],
      },
      testExecution: {
        totalTests: 0,
        passed: 0,
        failed: 0,
        totalDuration: 0,
      },
      comparisons: {
        total: 0,
        withDifferences: 0,
        averageSimilarity: 0,
      },
      warnings: [],
    });

    this.logger.info(`Started continuous evaluation for session ${sessionId}`);
  }

  /**
   * Evaluate test generation quality
   */
  private async onTestGenerated(event: EventPayload): Promise<void> {
    const { sessionId, data } = event;
    const { component, testCount, duration } = data || {};

    if (!component || testCount === undefined) return;

    const metrics = this.getOrCreateMetrics(sessionId);

    // Update metrics
    metrics.testGeneration.totalComponents++;
    metrics.testGeneration.totalTests += testCount;
    metrics.testGeneration.totalDuration += duration || 0;

    // Immediate quality assessment
    if (testCount < 3) {
      const warning = `Low test coverage for ${component}: only ${testCount} tests`;
      metrics.testGeneration.lowCoverageComponents.push(component);
      metrics.warnings.push(warning);

      this.logger.warn(`⚠️  ${warning}`);

      // Store metric for later analysis
      await this.storeMetric(sessionId, {
        type: 'test_generation_quality',
        component,
        testCount,
        duration,
        quality: 'low',
        timestamp: Date.now(),
      });
    } else {
      await this.storeMetric(sessionId, {
        type: 'test_generation_quality',
        component,
        testCount,
        duration,
        quality: 'good',
        timestamp: Date.now(),
      });
    }

    // Performance warning
    if (duration && duration > 30000) {
      const warning = `Slow test generation for ${component}: ${duration}ms`;
      metrics.warnings.push(warning);
      this.logger.warn(`⚠️  ${warning}`);
    }
  }

  /**
   * Evaluate test execution results
   */
  private async onTestExecuted(event: EventPayload): Promise<void> {
    const { sessionId, data } = event;
    const { component, passed, failed, duration } = data || {};

    if (!component) return;

    const metrics = this.getOrCreateMetrics(sessionId);

    // Update metrics
    const totalTests = (passed || 0) + (failed || 0);
    metrics.testExecution.totalTests += totalTests;
    metrics.testExecution.passed += passed || 0;
    metrics.testExecution.failed += failed || 0;
    metrics.testExecution.totalDuration += duration || 0;

    // Calculate failure rate
    const failureRate = totalTests > 0 ? (failed || 0) / totalTests : 0;

    if (failureRate > 0.3) {
      const warning = `High failure rate for ${component}: ${(failureRate * 100).toFixed(1)}%`;
      metrics.warnings.push(warning);
      this.logger.warn(`⚠️  ${warning}`);

      await this.storeMetric(sessionId, {
        type: 'test_execution_quality',
        component,
        failureRate,
        passed,
        failed,
        quality: 'poor',
        timestamp: Date.now(),
      });
    } else {
      await this.storeMetric(sessionId, {
        type: 'test_execution_quality',
        component,
        failureRate,
        passed,
        failed,
        quality: failureRate === 0 ? 'excellent' : 'good',
        timestamp: Date.now(),
      });
    }

    // Real-time success rate
    const overallSuccessRate =
      metrics.testExecution.totalTests > 0
        ? metrics.testExecution.passed / metrics.testExecution.totalTests
        : 0;

    this.logger.info(
      `📊 Session ${sessionId} - Overall success rate: ${(overallSuccessRate * 100).toFixed(1)}%`
    );
  }

  /**
   * Evaluate analysis results
   */
  private async onAnalysisComplete(event: EventPayload): Promise<void> {
    const { sessionId, data } = event;
    const { differencesFound, component } = data || {};

    this.logger.info(
      `Analysis complete for ${component}: ${differencesFound || 0} differences found`
    );

    await this.storeMetric(sessionId, {
      type: 'analysis_result',
      component,
      differencesFound,
      timestamp: Date.now(),
    });
  }

  /**
   * Evaluate comparison results
   */
  private async onComparisonComplete(event: EventPayload): Promise<void> {
    const { sessionId, data } = event;
    const { component, similarityScore, differencesFound } = data || {};

    const metrics = this.getOrCreateMetrics(sessionId);

    metrics.comparisons.total++;
    if (differencesFound > 0) {
      metrics.comparisons.withDifferences++;
    }

    if (similarityScore !== undefined) {
      // Running average
      const prevAvg = metrics.comparisons.averageSimilarity;
      const count = metrics.comparisons.total;
      metrics.comparisons.averageSimilarity =
        (prevAvg * (count - 1) + similarityScore) / count;
    }

    await this.storeMetric(sessionId, {
      type: 'comparison_quality',
      component,
      similarityScore,
      differencesFound,
      timestamp: Date.now(),
    });
  }

  /**
   * Finalize evaluation when session completes
   */
  private async onSessionCompleted(event: EventPayload): Promise<void> {
    const { sessionId } = event;
    const metrics = this.sessionMetrics.get(sessionId);

    if (!metrics) return;

    this.logger.info(
      `Session ${sessionId} completed - Generating final evaluation`
    );

    // Calculate final scores
    const testSuccessRate =
      metrics.testExecution.totalTests > 0
        ? metrics.testExecution.passed / metrics.testExecution.totalTests
        : 0;

    const averageTestsPerComponent =
      metrics.testGeneration.totalComponents > 0
        ? metrics.testGeneration.totalTests /
          metrics.testGeneration.totalComponents
        : 0;

    // Log summary
    this.logger.info(`
📊 Session ${sessionId} Summary:
   Test Generation:
     - Components tested: ${metrics.testGeneration.totalComponents}
     - Total tests: ${metrics.testGeneration.totalTests}
     - Avg tests/component: ${averageTestsPerComponent.toFixed(1)}
     - Low coverage components: ${metrics.testGeneration.lowCoverageComponents.length}

   Test Execution:
     - Total tests run: ${metrics.testExecution.totalTests}
     - Passed: ${metrics.testExecution.passed}
     - Failed: ${metrics.testExecution.failed}
     - Success rate: ${(testSuccessRate * 100).toFixed(1)}%

   Comparisons:
     - Total: ${metrics.comparisons.total}
     - With differences: ${metrics.comparisons.withDifferences}
     - Avg similarity: ${metrics.comparisons.averageSimilarity.toFixed(1)}%

   Warnings: ${metrics.warnings.length}
    `);

    // Clean up
    this.sessionMetrics.delete(sessionId);
  }

  /**
   * Get or create metrics for session
   */
  private getOrCreateMetrics(sessionId: string): SessionMetrics {
    if (!this.sessionMetrics.has(sessionId)) {
      this.sessionMetrics.set(sessionId, {
        testGeneration: {
          totalComponents: 0,
          totalTests: 0,
          totalDuration: 0,
          lowCoverageComponents: [],
        },
        testExecution: {
          totalTests: 0,
          passed: 0,
          failed: 0,
          totalDuration: 0,
        },
        comparisons: {
          total: 0,
          withDifferences: 0,
          averageSimilarity: 0,
        },
        warnings: [],
      });
    }
    return this.sessionMetrics.get(sessionId)!;
  }

  /**
   * Store metric to database
   */
  private async storeMetric(sessionId: string, metric: any): Promise<void> {
    try {
      // We could add a metrics table to the database
      // For now, just log
      this.logger.debug(`Metric stored: ${metric.type} for ${sessionId}`);
    } catch (error) {
      this.logger.error('Failed to store metric', error as Error);
    }
  }

  /**
   * Get current metrics for session
   */
  getSessionMetrics(sessionId: string): SessionMetrics | undefined {
    return this.sessionMetrics.get(sessionId);
  }
}

/**
 * Session metrics structure
 */
interface SessionMetrics {
  testGeneration: {
    totalComponents: number;
    totalTests: number;
    totalDuration: number;
    lowCoverageComponents: string[];
  };
  testExecution: {
    totalTests: number;
    passed: number;
    failed: number;
    totalDuration: number;
  };
  comparisons: {
    total: number;
    withDifferences: number;
    averageSimilarity: number;
  };
  warnings: string[];
}

export default ContinuousEvaluationAgent;
