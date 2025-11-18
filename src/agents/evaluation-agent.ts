import { BaseAgent } from './base-agent';
import {
  AgentType,
  AgentContext,
  AgentResult,
  Evaluation,
  EvaluationMetrics,
  EvaluationFeedback,
  TestQualityMetrics,
  ComparisonQualityMetrics,
  RemediationEffectivenessMetrics,
  Recommendation,
  PromptImprovement,
  ConfigSuggestion,
  TestCategory,
  SessionState,
} from '../types';
import { DatabaseManager } from '../storage/database';
import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';

/**
 * Evaluation Agent - Continuous improvement through feedback
 *
 * Responsibilities:
 * - Analyze test results and quality
 * - Measure comparison accuracy
 * - Track remediation effectiveness
 * - Generate actionable feedback
 * - Identify improvement opportunities
 * - Store evaluation metrics for learning
 */
export class EvaluationAgent extends BaseAgent {
  private ai: Anthropic;
  private readonly database: DatabaseManager;

  constructor(db: DatabaseManager) {
    super(AgentType.EVALUATION, db);
    this.database = db;
    this.ai = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    return this.executeWithTracking(context, async () => {
      const { session, config } = context;

      try {
        this.logger.info('Starting evaluation and analysis');

        // Collect metrics from all phases
        const testQuality = await this.evaluateTestQuality(session.id);
        const comparisonQuality = await this.evaluateComparisonQuality(session.id);
        const remediationEffectiveness = await this.evaluateRemediationEffectiveness(session.id);

        // Calculate overall score
        const overallScore = this.calculateOverallScore(
          testQuality,
          comparisonQuality,
          remediationEffectiveness
        );

        const metrics: EvaluationMetrics = {
          testQuality,
          comparisonQuality,
          remediationEffectiveness,
          overallScore,
        };

        // Generate AI-powered feedback and recommendations
        const feedback = await this.generateFeedback(metrics, session.id, config);

        // Create evaluation record
        const evaluation: Evaluation = {
          id: uuidv4(),
          sessionId: session.id,
          agentType: AgentType.EVALUATION,
          metrics,
          feedback,
          timestamp: new Date(),
        };

        // Save to database for historical learning
        this.database.saveEvaluation(evaluation);

        this.logger.info(`Evaluation complete. Overall score: ${overallScore.toFixed(2)}/100`);
        this.logger.info(`Generated ${feedback.recommendations.length} recommendations`);

        return this.success(
          {
            evaluation,
            improvements: feedback.recommendations.filter(r => r.actionable),
          },
          SessionState.COMPLETE
        );
      } catch (error) {
        return this.failure(error as Error, SessionState.ERROR);
      }
    });
  }

  /**
   * Evaluate the quality of generated tests
   */
  private async evaluateTestQuality(sessionId: string): Promise<TestQualityMetrics> {
    const testSuites = this.database.getTestSuites(sessionId);
    const testResults = this.database.getTestResults(sessionId);

    // Calculate totals
    const totalTests = testResults.length;
    const passedTests = testResults.filter(t => t.status === 'passed').length;
    const failedTests = testResults.filter(t => t.status === 'failed').length;
    const successRate = totalTests > 0 ? passedTests / totalTests : 0;

    // Calculate coverage score based on test categories
    const categoryDistribution: Record<TestCategory, number> = {
      [TestCategory.FUNCTIONAL]: 0,
      [TestCategory.VISUAL]: 0,
      [TestCategory.ACCESSIBILITY]: 0,
      [TestCategory.PERFORMANCE]: 0,
    };

    for (const suite of testSuites) {
      for (const test of suite.tests) {
        if (test.category in categoryDistribution) {
          categoryDistribution[test.category as TestCategory]++;
        }
      }
    }

    // Coverage score based on category balance (ideal is all 4 categories represented)
    const categoriesUsed = Object.values(categoryDistribution).filter(count => count > 0).length;
    const coverageScore = (categoriesUsed / 4) * 100;

    // Component coverage - aggregate by suite component
    const componentCoverage: Record<string, number> = {};
    for (const suite of testSuites) {
      // Calculate coverage based on test results
      const componentResults = testResults.filter(
        t => t.version && suite.component
      );
      const passed = componentResults.filter(t => t.status === 'passed').length;
      componentCoverage[suite.component] = componentResults.length > 0
        ? (passed / componentResults.length) * 100
        : 0;
    }

    // Average test duration
    const averageTestDuration = testResults.length > 0
      ? testResults.reduce((sum, t) => sum + t.duration, 0) / testResults.length
      : 0;

    return {
      totalTests,
      passedTests,
      failedTests,
      successRate,
      coverageScore,
      componentCoverage,
      categoryDistribution,
      averageTestDuration,
    };
  }

  /**
   * Evaluate the quality of visual/DOM comparisons
   */
  private async evaluateComparisonQuality(sessionId: string): Promise<ComparisonQualityMetrics> {
    const comparisons = this.database.getComparisons(sessionId);
    const snapshotComparisons = this.database.getSnapshotComparisons(sessionId);

    const totalComparisons = comparisons.length + snapshotComparisons.length;

    // Count detected differences
    let detectedDifferences = 0;
    let totalSimilarityScore = 0;

    for (const comp of comparisons) {
      if (comp.differences && comp.differences.length > 0) {
        detectedDifferences++;
      }
    }

    for (const snapComp of snapshotComparisons) {
      totalSimilarityScore += snapComp.similarityScore;
      if (snapComp.differencesFound > 0) {
        detectedDifferences++;
      }
    }

    // For now, we estimate false positives and false negatives
    // These could be improved with user feedback in future iterations
    const estimatedFalsePositives = Math.floor(detectedDifferences * 0.05); // Assume 5% false positive rate
    const estimatedFalseNegatives = Math.floor((totalComparisons - detectedDifferences) * 0.03); // Assume 3% false negative rate

    const truePositives = detectedDifferences - estimatedFalsePositives;
    const trueNegatives = totalComparisons - detectedDifferences - estimatedFalseNegatives;

    const precision = truePositives + estimatedFalsePositives > 0
      ? truePositives / (truePositives + estimatedFalsePositives)
      : 1;

    const recall = truePositives + estimatedFalseNegatives > 0
      ? truePositives / (truePositives + estimatedFalseNegatives)
      : 1;

    const averageSimilarityScore = snapshotComparisons.length > 0
      ? totalSimilarityScore / snapshotComparisons.length
      : 100;

    // Accuracy score combines precision and recall
    const accuracyScore = ((precision + recall) / 2) * 100;

    return {
      totalComparisons,
      detectedDifferences,
      falsePositives: estimatedFalsePositives,
      falseNegatives: estimatedFalseNegatives,
      precision,
      recall,
      averageSimilarityScore,
      accuracyScore,
    };
  }

  /**
   * Evaluate the effectiveness of remediations
   */
  private async evaluateRemediationEffectiveness(
    sessionId: string
  ): Promise<RemediationEffectivenessMetrics | undefined> {
    const remediations = this.database.getRemediations(sessionId);

    if (remediations.length === 0) {
      return undefined;
    }

    const totalRemediations = remediations.length;
    const approvedRemediations = remediations.filter(r => r.status === 'APPROVED' || r.status === 'IMPLEMENTING' || r.status === 'IMPLEMENTED' || r.status === 'VERIFIED').length;
    const implementedRemediations = remediations.filter(r => r.status === 'IMPLEMENTED' || r.status === 'VERIFIED').length;
    const verifiedRemediations = remediations.filter(r => r.status === 'VERIFIED').length;

    const successRate = totalRemediations > 0 ? verifiedRemediations / totalRemediations : 0;

    // Calculate average implementation time
    let totalImplementationTime = 0;
    let implementationCount = 0;

    for (const remediation of remediations) {
      if (remediation.implementation && remediation.implementation.implementedAt) {
        const timeDiff = remediation.implementation.implementedAt.getTime() - remediation.createdAt.getTime();
        totalImplementationTime += timeDiff;
        implementationCount++;
      }
    }

    const averageImplementationTime = implementationCount > 0
      ? totalImplementationTime / implementationCount
      : 0;

    // Calculate average confidence from solutions
    let totalConfidence = 0;
    let confidenceCount = 0;

    for (const remediation of remediations) {
      if (remediation.proposal && remediation.proposal.solutions) {
        for (const solution of remediation.proposal.solutions) {
          totalConfidence += solution.confidence;
          confidenceCount++;
        }
      }
    }

    const averageConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;

    return {
      totalRemediations,
      approvedRemediations,
      implementedRemediations,
      verifiedRemediations,
      successRate,
      averageImplementationTime,
      averageConfidence,
    };
  }

  /**
   * Calculate overall quality score (0-100)
   */
  private calculateOverallScore(
    testQuality: TestQualityMetrics,
    comparisonQuality: ComparisonQualityMetrics,
    remediationEffectiveness?: RemediationEffectivenessMetrics
  ): number {
    // Weighted scoring
    const weights = {
      testSuccess: 0.30,      // 30% - Test success rate
      testCoverage: 0.20,     // 20% - Test coverage
      comparisonAccuracy: 0.30, // 30% - Comparison accuracy
      remediationSuccess: 0.20, // 20% - Remediation success (if applicable)
    };

    const testSuccessScore = testQuality.successRate * 100;
    const testCoverageScore = testQuality.coverageScore;
    const comparisonScore = comparisonQuality.accuracyScore;
    const remediationScore = remediationEffectiveness
      ? remediationEffectiveness.successRate * 100
      : 100; // Default to 100 if no remediations

    const overallScore =
      testSuccessScore * weights.testSuccess +
      testCoverageScore * weights.testCoverage +
      comparisonScore * weights.comparisonAccuracy +
      remediationScore * weights.remediationSuccess;

    return Math.min(100, Math.max(0, overallScore));
  }

  /**
   * Generate AI-powered feedback and recommendations
   */
  private async generateFeedback(
    metrics: EvaluationMetrics,
    sessionId: string,
    config: any
  ): Promise<EvaluationFeedback> {
    const prompt = `You are an expert in software testing and quality analysis. Analyze the following metrics from a UI version testing session and provide actionable feedback.

## Metrics

### Test Quality
- Total Tests: ${metrics.testQuality.totalTests}
- Success Rate: ${(metrics.testQuality.successRate * 100).toFixed(2)}%
- Coverage Score: ${metrics.testQuality.coverageScore.toFixed(2)}/100
- Average Test Duration: ${metrics.testQuality.averageTestDuration.toFixed(0)}ms
- Category Distribution: ${JSON.stringify(metrics.testQuality.categoryDistribution)}

### Comparison Quality
- Total Comparisons: ${metrics.comparisonQuality.totalComparisons}
- Detected Differences: ${metrics.comparisonQuality.detectedDifferences}
- Precision: ${(metrics.comparisonQuality.precision * 100).toFixed(2)}%
- Recall: ${(metrics.comparisonQuality.recall * 100).toFixed(2)}%
- Accuracy: ${metrics.comparisonQuality.accuracyScore.toFixed(2)}/100
- Average Similarity Score: ${metrics.comparisonQuality.averageSimilarityScore.toFixed(2)}/100

${metrics.remediationEffectiveness ? `### Remediation Effectiveness
- Total Remediations: ${metrics.remediationEffectiveness.totalRemediations}
- Success Rate: ${(metrics.remediationEffectiveness.successRate * 100).toFixed(2)}%
- Average Confidence: ${(metrics.remediationEffectiveness.averageConfidence * 100).toFixed(2)}%
` : ''}

### Overall Score: ${metrics.overallScore.toFixed(2)}/100

---

Provide feedback in the following JSON structure:

{
  "strengths": ["list of what went well"],
  "weaknesses": ["list of areas needing improvement"],
  "recommendations": [
    {
      "priority": "high|medium|low",
      "category": "test-generation|comparison|remediation|workflow",
      "title": "brief title",
      "description": "detailed description",
      "actionable": true|false,
      "estimatedImpact": "high|medium|low"
    }
  ],
  "promptImprovements": [
    {
      "agentType": "TEST_GENERATION|ANALYSIS|etc",
      "currentIssue": "what's the problem",
      "suggestedChange": "how to improve the prompt",
      "expectedImprovement": "what improvement to expect",
      "confidence": 0.0-1.0
    }
  ],
  "configSuggestions": [
    {
      "configPath": "path.to.config",
      "currentValue": current_value,
      "suggestedValue": suggested_value,
      "rationale": "why change this",
      "impact": "high|medium|low"
    }
  ]
}

Focus on:
1. Test quality and coverage improvements
2. Reducing false positives in comparisons
3. Increasing test success rates
4. Actionable recommendations that can be implemented
5. Specific prompt improvements for AI agents

Return ONLY valid JSON, no markdown or explanations.`;

    try {
      const response = await this.ai.messages.create({
        model: config.ai.model,
        max_tokens: config.ai.maxTokens || 8192,
        temperature: 0.4,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from AI');
      }

      let jsonText = content.text.trim();

      // Remove markdown code blocks if present
      if (jsonText.startsWith('```')) {
        const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (codeBlockMatch) {
          jsonText = codeBlockMatch[1].trim();
        }
      }

      const feedbackData = JSON.parse(jsonText);

      // Validate and structure the feedback
      const feedback: EvaluationFeedback = {
        strengths: feedbackData.strengths || [],
        weaknesses: feedbackData.weaknesses || [],
        recommendations: feedbackData.recommendations || [],
        promptImprovements: feedbackData.promptImprovements || [],
        configSuggestions: feedbackData.configSuggestions || [],
      };

      return feedback;
    } catch (error) {
      this.logger.error('Failed to generate AI feedback, using fallback', error as Error);
      return this.generateFallbackFeedback(metrics);
    }
  }

  /**
   * Generate basic feedback without AI
   */
  private generateFallbackFeedback(metrics: EvaluationMetrics): EvaluationFeedback {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const recommendations: Recommendation[] = [];

    // Analyze test quality
    if (metrics.testQuality.successRate >= 0.9) {
      strengths.push(`Excellent test success rate: ${(metrics.testQuality.successRate * 100).toFixed(1)}%`);
    } else if (metrics.testQuality.successRate < 0.7) {
      weaknesses.push(`Low test success rate: ${(metrics.testQuality.successRate * 100).toFixed(1)}%`);
      recommendations.push({
        priority: 'high',
        category: 'test-generation',
        title: 'Improve Test Reliability',
        description: 'Review failed tests and improve test generation to increase success rate above 80%',
        actionable: true,
        estimatedImpact: 'high',
      });
    }

    // Analyze coverage
    if (metrics.testQuality.coverageScore >= 75) {
      strengths.push(`Good test coverage across categories: ${metrics.testQuality.coverageScore.toFixed(1)}/100`);
    } else {
      weaknesses.push(`Limited test coverage: ${metrics.testQuality.coverageScore.toFixed(1)}/100`);
      recommendations.push({
        priority: 'medium',
        category: 'test-generation',
        title: 'Increase Test Coverage',
        description: 'Generate tests across all categories: functional, visual, accessibility, and performance',
        actionable: true,
        estimatedImpact: 'medium',
      });
    }

    // Analyze comparison accuracy
    if (metrics.comparisonQuality.accuracyScore >= 90) {
      strengths.push(`High comparison accuracy: ${metrics.comparisonQuality.accuracyScore.toFixed(1)}/100`);
    } else {
      weaknesses.push(`Comparison accuracy needs improvement: ${metrics.comparisonQuality.accuracyScore.toFixed(1)}/100`);
      recommendations.push({
        priority: 'medium',
        category: 'comparison',
        title: 'Refine Comparison Thresholds',
        description: 'Adjust visual and DOM comparison thresholds to reduce false positives/negatives',
        actionable: true,
        estimatedImpact: 'medium',
      });
    }

    return {
      strengths,
      weaknesses,
      recommendations,
      promptImprovements: [],
      configSuggestions: [],
    };
  }
}

export default EvaluationAgent;
