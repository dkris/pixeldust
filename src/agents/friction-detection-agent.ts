/**
 * FrictionDetectionAgent
 *
 * Consumes raw FrictionSignal records from the database, scores them
 * using rule-based heuristics, and returns a prioritized list of signals
 * worth acting on.
 *
 * Rule-based scoring is synchronous and fast. Claude is invoked ONLY
 * for CRITICAL signals to add semantic context (e.g. "this is the primary
 * CTA of the checkout flow") — throttled to once per (url, selector) pair
 * per hour to control cost.
 */

import { BaseAgent } from './base-agent';
import {
  AgentContext,
  AgentResult,
  FrictionSignal,
  Severity,
} from '../types';
import { RuntimeAgentType } from '../types';
import Anthropic from '@anthropic-ai/sdk';
import { DatabaseManager } from '../storage/database';

// Score weight per signal type (higher = higher priority)
const SIGNAL_WEIGHT: Record<string, number> = {
  rage_click: 10,
  form_abandonment: 8,
  js_error: 9,
  dead_click: 6,
  error_click: 7,
  scroll_depth_low: 3,
  slow_interaction: 4,
  rapid_navigation: 5,
  repeated_interaction: 6,
};

const SEVERITY_WEIGHT: Record<Severity, number> = {
  [Severity.CRITICAL]: 20,
  [Severity.HIGH]: 12,
  [Severity.MEDIUM]: 6,
  [Severity.LOW]: 2,
  [Severity.INFO]: 0,
};

export interface ScoredSignal extends FrictionSignal {
  score: number;
  semanticContext?: string;
}

export class FrictionDetectionAgent extends BaseAgent {
  private ai: Anthropic;
  // Throttle cache: key → lastEnrichedAt
  private enrichCache = new Map<string, number>();
  private readonly ENRICH_THROTTLE_MS = 60 * 60 * 1000;

  constructor(db?: DatabaseManager) {
    super(RuntimeAgentType.FRICTION_DETECTION as any, db);
    this.ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    return this.executeWithTracking(context, async () => {
      const { data, config } = context;
      const appId: string = data?.appId ?? config?.runtime?.appId;
      const signals: FrictionSignal[] = data?.signals ?? [];

      if (!signals.length) {
        return this.success({ prioritizedSignals: [] });
      }

      const scored = this.scoreSignals(signals);
      const actionable = scored.filter(s => s.score >= 8);   // threshold

      // Enrich CRITICAL signals with semantic context from Claude (throttled)
      const enriched = await this.enrichCritical(actionable, config);

      this.logger.info(
        `FrictionDetection: ${signals.length} signals → ${actionable.length} actionable`
      );

      return this.success({ prioritizedSignals: enriched, appId });
    });
  }

  /**
   * Score and sort signals. Exposed as public for use by MutationProposalAgent.
   */
  scoreSignals(signals: FrictionSignal[]): ScoredSignal[] {
    return signals
      .map(s => ({
        ...s,
        score: (SIGNAL_WEIGHT[s.type] ?? 1) + SEVERITY_WEIGHT[s.severity] + Math.min(s.count, 10),
      }))
      .sort((a, b) => b.score - a.score);
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private async enrichCritical(
    signals: ScoredSignal[],
    config: any
  ): Promise<ScoredSignal[]> {
    const enriched: ScoredSignal[] = [];

    for (const signal of signals) {
      if (signal.severity !== Severity.CRITICAL && signal.score < 25) {
        enriched.push(signal);
        continue;
      }

      const cacheKey = `${signal.url}|${signal.selector ?? ''}`;
      const lastEnriched = this.enrichCache.get(cacheKey);
      if (lastEnriched && Date.now() - lastEnriched < this.ENRICH_THROTTLE_MS) {
        enriched.push(signal);
        continue;
      }

      try {
        const context = await this.getSemanticContext(signal, config);
        this.enrichCache.set(cacheKey, Date.now());
        enriched.push({ ...signal, semanticContext: context });
      } catch {
        enriched.push(signal);
      }
    }

    return enriched;
  }

  private async getSemanticContext(
    signal: FrictionSignal,
    config: any
  ): Promise<string> {
    const prompt = `A user friction signal was detected:
- Type: ${signal.type}
- URL: ${signal.url}
- Element: ${signal.selector ?? 'unknown'} ${signal.elementText ? `("${signal.elementText}")` : ''}
- Severity: ${signal.severity}, Count: ${signal.count}

In 1-2 sentences, describe what UX problem this likely indicates and why it matters.
Be specific and actionable. Do not suggest solutions yet.`;

    const response = await this.ai.messages.create({
      model: config?.ai?.model ?? 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    return content.type === 'text' ? content.text.trim() : '';
  }
}

export default FrictionDetectionAgent;
