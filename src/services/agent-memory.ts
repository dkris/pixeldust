import { EventBus, EventType, EventPayload } from '../core/event-bus';

interface MemoryEntry {
  key: string;
  value: any;
  expiresAt?: number;
  tags?: string[];
  contextFingerprint?: string;
}

export class AgentMemory {
  private shortTerm: Map<string, MemoryEntry[]> = new Map();
  private longTerm: Map<string, MemoryEntry[]> = new Map();

  constructor(private eventBus?: EventBus) {
    this.eventBus?.on(EventType.EVALUATION_COMPLETED, (event) => this.captureEvaluation(event));
  }

  remember(
    agent: string,
    key: string,
    value: any,
    options?: { ttlMs?: number; scope?: 'short' | 'long'; tags?: string[]; contextFingerprint?: string }
  ): void {
    const entry: MemoryEntry = {
      key,
      value,
      tags: options?.tags,
      contextFingerprint: options?.contextFingerprint,
    };
    if (options?.ttlMs) {
      entry.expiresAt = Date.now() + options.ttlMs;
    }
    const store = options?.scope === 'short' ? this.shortTerm : this.longTerm;
    const entries = store.get(agent) || [];
    entries.push(entry);
    store.set(agent, entries.slice(-50));
  }

  recall(agent: string, key: string): any {
    const entry = this.findEntry(agent, key);
    return entry?.value;
  }

  promptHints(agent: string): string {
    const fragments: string[] = [];
    const longTerm = this.longTerm.get(agent) || [];
    longTerm.filter(entry => !this.isExpired(entry)).forEach(entry => {
      fragments.push(`- ${entry.value}`);
    });

    const shortTerm = this.shortTerm.get(agent) || [];
    shortTerm.filter(entry => !this.isExpired(entry)).forEach(entry => {
      fragments.push(`- Recent: ${entry.value}`);
    });

    return fragments.join('\n');
  }

  pruneExpired(): void {
    [this.shortTerm, this.longTerm].forEach(store => {
      store.forEach((entries, agent) => {
        store.set(agent, entries.filter(entry => !this.isExpired(entry)));
      });
    });
  }

  private findEntry(agent: string, key: string): MemoryEntry | undefined {
    const sets = [this.shortTerm, this.longTerm];
    for (const store of sets) {
      const entry = (store.get(agent) || []).find(item => item.key === key && !this.isExpired(item));
      if (entry) {
        return entry;
      }
    }
    return undefined;
  }

  private captureEvaluation(event: EventPayload): void {
    if (!event.data) return;
    const summary = event.data.summary || event.data;
    this.remember('EVALUATION', `feedback-${event.timestamp}`, summary, {
      scope: 'long',
      contextFingerprint: event.metadata?.contextFingerprint,
    });
  }

  private isExpired(entry?: MemoryEntry): boolean {
    return !!(entry?.expiresAt && entry.expiresAt < Date.now());
  }
}
