import { BaseAgent } from './base-agent';
import {
  AgentType,
  AgentContext,
  AgentResult,
  Remediation,
  RemediationProposal,
  Solution,
  RemediationStatus,
  FrictionSignal,
  UIMutation,
  MutationType,
} from '../types';
import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../storage/database';

/**
 * Remediation Agent - Proposes fixes for detected issues
 *
 * Responsibilities:
 * - AI-powered root cause analysis
 * - Generate fix proposals
 * - Create migration guides
 * - Suggest breaking change mitigations
 * - Prioritize issues by severity
 */
export class RemediationAgent extends BaseAgent {
  private ai: Anthropic;

  constructor(db?: DatabaseManager) {
    super(AgentType.REMEDIATION, db);
    this.ai = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    return this.executeWithTracking(context, async () => {
      const { config, session, data } = context;
      const comparisons = data?.comparisons || [];

      try {
        this.logger.info('Generating remediation proposals');

        const remediations: Remediation[] = [];

        for (const comparison of comparisons) {
          if (comparison.differences.length === 0) continue;

          this.logger.info(`Analyzing differences for ${comparison.baseVersion} → ${comparison.targetVersion}`);

          const proposal = await this.generateProposal(comparison, config);

          const remediation: Remediation = {
            id: uuidv4(),
            comparisonId: comparison.id,
            sessionId: session.id,
            proposal,
            status: RemediationStatus.PROPOSED,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          remediations.push(remediation);
        }

        this.logger.info(`Generated ${remediations.length} remediation proposals`);

        return this.success({
          remediations,
        });
      } catch (error) {
        return this.failure(error as Error);
      }
    });
  }

  private async generateProposal(
    comparison: any,
    config: any
  ): Promise<RemediationProposal> {
    const differencesDescription = this.formatDifferences(comparison.differences);

    const prompt = `You are an expert software engineer specializing in UI framework migrations and version upgrades.

Analyze the following differences detected between version ${comparison.baseVersion} and ${comparison.targetVersion}:

${differencesDescription}

Provide a comprehensive remediation proposal:

1. **Root Cause Analysis**: Explain why these differences occurred
2. **Impact Assessment**: Describe the impact on the application
3. **Solutions**: Propose 2-3 different solutions (quick fix, optimal fix, alternative approach)

For each solution, provide:
- Title and description
- Step-by-step implementation steps
- Code changes (if applicable)
- Confidence score (0-1)
- Pros and cons
- Estimated effort

Return your response as JSON:
{
  "title": "Brief title for the remediation",
  "description": "Overall description",
  "rootCause": "Root cause analysis",
  "solutions": [
    {
      "id": "solution-1",
      "title": "Solution title",
      "description": "Solution description",
      "steps": ["step 1", "step 2"],
      "codeChanges": [
        {
          "filePath": "path/to/file",
          "changeType": "modify",
          "before": "old code",
          "after": "new code",
          "lineNumber": 42
        }
      ],
      "confidence": 0.9,
      "pros": ["pro 1", "pro 2"],
      "cons": ["con 1"]
    }
  ],
  "recommendedSolution": "solution-1",
  "estimatedImpact": {
    "breakingChanges": true,
    "affectedComponents": ["component1"],
    "migrationComplexity": "medium",
    "estimatedEffort": "2-4 hours"
  }
}`;

    try {
      const response = await this.ai.messages.create({
        model: config.ai.model,
        max_tokens: config.ai.maxTokens || 4096,
        temperature: config.ai.temperature || 0.7,
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

      // Parse JSON from response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Could not extract JSON from AI response');
      }

      const proposalData = JSON.parse(jsonMatch[0]);

      return {
        title: proposalData.title,
        description: proposalData.description,
        rootCause: proposalData.rootCause,
        solutions: proposalData.solutions.map((s: any) => ({
          ...s,
          id: s.id || uuidv4(),
        })),
        recommendedSolution: proposalData.recommendedSolution,
        estimatedImpact: proposalData.estimatedImpact,
      };
    } catch (error) {
      this.logger.error('Failed to generate AI proposal, using fallback', error as Error);
      return this.getFallbackProposal(comparison);
    }
  }

  private formatDifferences(differences: any[]): string {
    return differences.map((diff, idx) => {
      let description = `${idx + 1}. **${diff.type}** (${diff.severity})\n`;
      description += `   ${diff.description}\n`;

      if (diff.location) {
        description += `   Location: ${diff.location}\n`;
      }

      if (diff.visualDiff) {
        description += `   Visual change: ${diff.visualDiff.pixelDiffPercentage.toFixed(2)}% pixels differ\n`;
      }

      if (diff.domDiff) {
        description += `   DOM changes: ${diff.domDiff.added.length} added, ${diff.domDiff.removed.length} removed, ${diff.domDiff.modified.length} modified\n`;
      }

      return description;
    }).join('\n');
  }

  // ============================================================================
  // Runtime: Mutation Proposal (App Immune System)
  // ============================================================================

  /**
   * Generate UI mutations to address a friction signal.
   * Returns an array of UIMutation objects (CSS/DOM patches) rather than
   * source-code CodeChange objects. Reuses the same Anthropic client and
   * JSON-parse-with-fallback pattern as generateProposal().
   */
  async proposeMutation(
    signal: FrictionSignal,
    config: any
  ): Promise<UIMutation[]> {
    const prompt = `You are a UX engineer specialising in production web app optimisation.

A friction signal was detected in a live application:
- Type: ${signal.type}
- URL: ${signal.url}
- Element: ${signal.selector ?? 'unknown'} ${signal.elementText ? `("${signal.elementText}")` : ''}
- Severity: ${signal.severity}
- Occurrences: ${signal.count}
${signal.context ? `- Context: ${JSON.stringify(signal.context)}` : ''}

Generate 1-3 UI mutations that would fix this friction.
Prefer css_patch mutations over all others — they are safest and instantly reversible.
Only use dom_attribute or copy_change when CSS alone cannot solve the problem.
Do NOT use flow_redirect or component_swap unless absolutely necessary.

Return ONLY valid JSON (no markdown, no extra text):
{
  "mutations": [
    {
      "type": "css_patch",
      "targetSelector": ".my-button",
      "cssRule": ".my-button { ... }",
      "description": "One-line human description of what this fixes",
      "confidence": 0.85
    }
  ]
}

For dom_attribute mutations, use "attributeChanges": { "aria-label": "new value" } instead of cssRule.
For copy_change mutations, use "newContent": "new text" instead of cssRule.`;

    try {
      const response = await this.ai.messages.create({
        model: config.ai?.model ?? 'claude-sonnet-4-5-20250929',
        max_tokens: config.ai?.maxTokens ?? 2048,
        temperature: 0.3,   // Lower temperature for structured output
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') throw new Error('Non-text AI response');

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in AI response');

      const parsed = JSON.parse(jsonMatch[0]);
      const rawMutations: any[] = parsed.mutations ?? [];

      return rawMutations
        .filter(m => m.type && m.targetSelector && m.description)
        .map(m => ({
          id: uuidv4(),
          experimentId: '',   // Filled in by MutationProposalAgent after experiment creation
          type: m.type as MutationType,
          targetSelector: m.targetSelector,
          cssRule: m.cssRule,
          attributeChanges: m.attributeChanges,
          newContent: m.newContent,
          script: m.script,
          description: m.description,
          generatedBy: 'claude' as const,
          confidence: typeof m.confidence === 'number' ? m.confidence : 0.7,
          frictionSignalId: signal.id,
          createdAt: Date.now(),
        }));
    } catch (error) {
      this.logger.error('proposeMutation: AI call failed, using CSS fallback', error as Error);
      return this.getFallbackMutation(signal);
    }
  }

  private getFallbackMutation(signal: FrictionSignal): UIMutation[] {
    if (!signal.selector) return [];
    // Generic visibility improvement for rage-click / dead-click signals
    const cssRule = `${signal.selector} { cursor: pointer !important; outline: 2px solid #0070f3 !important; }`;
    return [{
      id: uuidv4(),
      experimentId: '',
      type: 'css_patch',
      targetSelector: signal.selector,
      cssRule,
      description: `Improve visibility of ${signal.selector} to reduce ${signal.type}`,
      generatedBy: 'claude',
      confidence: 0.4,
      frictionSignalId: signal.id,
      createdAt: Date.now(),
    }];
  }

  private getFallbackProposal(comparison: any): RemediationProposal {
    return {
      title: `Remediation for ${comparison.baseVersion} → ${comparison.targetVersion}`,
      description: `${comparison.differences.length} differences detected between versions`,
      rootCause: 'Version upgrade introduces breaking changes',
      solutions: [
        {
          id: uuidv4(),
          title: 'Manual review and update',
          description: 'Review each difference and update code accordingly',
          steps: [
            'Review the comparison report',
            'Update affected components',
            'Test changes thoroughly',
          ],
          confidence: 0.7,
          pros: ['Thorough review', 'Custom solutions'],
          cons: ['Time-consuming', 'Manual effort'],
        },
      ],
      recommendedSolution: 'Manual review and update',
      estimatedImpact: {
        breakingChanges: true,
        affectedComponents: ['multiple'],
        migrationComplexity: 'medium',
        estimatedEffort: 'Varies',
      },
    };
  }
}

export default RemediationAgent;
