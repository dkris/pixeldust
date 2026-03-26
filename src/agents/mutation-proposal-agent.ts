/**
 * MutationProposalAgent
 *
 * Wraps RemediationAgent.proposeMutation() to:
 * 1. Receive prioritized FrictionSignals from FrictionDetectionAgent
 * 2. Call proposeMutation() for each high-priority signal
 * 3. Validate proposed mutations (CSS syntax check, selector validity)
 * 4. Return UIMutation[] ready for ExperimentOrchestratorAgent
 *
 * Tracked as a separate agent so ResilienceManager can apply per-agent
 * circuit-breaking and the agent_executions table captures its token cost.
 */

import { BaseAgent } from './base-agent';
import {
  AgentContext,
  AgentResult,
  UIMutation,
  FrictionSignal,
} from '../types';
import { RuntimeAgentType } from '../types';
import { RemediationAgent } from './remediation-agent';
import { DatabaseManager } from '../storage/database';
import { ScoredSignal } from './friction-detection-agent';

// Minimum confidence to accept a mutation
const MIN_CONFIDENCE = 0.35;

// Very basic CSS syntax validation
function isValidCss(rule: string): boolean {
  if (!rule || rule.trim().length === 0) return false;
  // Must contain at least one { } pair with content
  const braceMatch = rule.match(/\{([^}]+)\}/);
  if (!braceMatch) return false;
  // Must contain at least one : (property: value)
  return braceMatch[1].includes(':');
}

function isValidSelector(selector: string): boolean {
  if (!selector || selector.trim().length === 0) return false;
  // Reject obviously invalid selectors
  if (selector.includes('<') || selector.includes('>') || selector.length > 500) return false;
  return true;
}

function validateMutation(m: UIMutation): { valid: boolean; reason?: string } {
  if (!isValidSelector(m.targetSelector)) {
    return { valid: false, reason: `Invalid selector: ${m.targetSelector}` };
  }
  if (m.type === 'css_patch' && !isValidCss(m.cssRule ?? '')) {
    return { valid: false, reason: `Invalid CSS rule for mutation ${m.id}` };
  }
  if (m.confidence < MIN_CONFIDENCE) {
    return { valid: false, reason: `Confidence ${m.confidence} below threshold ${MIN_CONFIDENCE}` };
  }
  return { valid: true };
}

export class MutationProposalAgent extends BaseAgent {
  private remediationAgent: RemediationAgent;

  constructor(db?: DatabaseManager) {
    super(RuntimeAgentType.MUTATION_PROPOSAL as any, db);
    this.remediationAgent = new RemediationAgent(db);
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    return this.executeWithTracking(context, async () => {
      const { data, config } = context;
      const signals: (FrictionSignal | ScoredSignal)[] = data?.prioritizedSignals ?? [];
      const appId: string = data?.appId ?? config?.runtime?.appId;

      if (!signals.length) {
        return this.success({ mutations: [], appId });
      }

      const allMutations: UIMutation[] = [];
      const rejectedCount = { count: 0 };

      for (const signal of signals) {
        try {
          const proposed = await this.remediationAgent.proposeMutation(signal, config);
          const valid: UIMutation[] = [];

          for (const m of proposed) {
            const check = validateMutation(m);
            if (check.valid) {
              valid.push(m);
            } else {
              this.logger.warn(`Mutation rejected: ${check.reason}`);
              rejectedCount.count++;
            }
          }

          allMutations.push(...valid);
          this.logger.info(
            `Signal ${signal.id} (${signal.type}): ${valid.length} valid mutations proposed`
          );
        } catch (error) {
          this.logger.error(
            `proposeMutation failed for signal ${signal.id}`,
            error as Error
          );
        }
      }

      this.logger.info(
        `MutationProposal: ${allMutations.length} mutations accepted, ${rejectedCount.count} rejected`
      );

      return this.success({ mutations: allMutations, appId, signals });
    });
  }
}

export default MutationProposalAgent;
