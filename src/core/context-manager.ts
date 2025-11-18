import { createHash } from 'crypto';

export type ContextLayerType = 'persistent' | 'shared' | 'ephemeral';

interface ContextEntry {
  value: any;
  expiresAt?: number;
  version: number;
  tags?: string[];
  updatedAt: number;
}

export interface ContextSetOptions {
  ttlMs?: number;
  tags?: string[];
}

export interface ContextSnapshotOptions {
  layer?: ContextLayerType;
}

export class LayeredContextManager {
  private layers: Record<ContextLayerType, Map<string, ContextEntry>> = {
    persistent: new Map(),
    shared: new Map(),
    ephemeral: new Map(),
  };
  private versionCounter = 0;

  constructor(existing?: Partial<Record<ContextLayerType, Map<string, ContextEntry>>>) {
    if (existing) {
      (Object.keys(existing) as ContextLayerType[]).forEach(layer => {
        if (existing[layer]) {
          this.layers[layer] = new Map(existing[layer]);
        }
      });
    }
  }

  set(layer: ContextLayerType, key: string, value: any, options?: ContextSetOptions): void {
    const entry: ContextEntry = {
      value,
      version: ++this.versionCounter,
      updatedAt: Date.now(),
      tags: options?.tags,
    };

    if (options?.ttlMs) {
      entry.expiresAt = Date.now() + options.ttlMs;
    }

    this.layers[layer].set(key, entry);
  }

  get<T = any>(key: string, layerOrder: ContextLayerType[] = ['ephemeral', 'shared', 'persistent']): T | undefined {
    for (const layer of layerOrder) {
      const entry = this.layers[layer].get(key);
      if (entry && !this.isExpired(entry)) {
        return entry.value as T;
      }
    }
    return undefined;
  }

  snapshot(options?: ContextSnapshotOptions): Record<string, any> {
    const snapshot: Record<string, any> = {};
    const layers = options?.layer ? [options.layer] : (Object.keys(this.layers) as ContextLayerType[]);

    layers.forEach(layer => {
      this.layers[layer].forEach((entry, key) => {
        if (!this.isExpired(entry)) {
          snapshot[key] = entry.value;
        }
      });
    });

    return snapshot;
  }

  prune(layers?: ContextLayerType[]): void {
    const targets = layers && layers.length > 0 ? layers : (Object.keys(this.layers) as ContextLayerType[]);
    targets.forEach(layer => {
      const store = this.layers[layer];
      store.forEach((entry, key) => {
        if (this.isExpired(entry)) {
          store.delete(key);
        }
      });
    });
  }

  recordRepairNote(note: string, metadata?: Record<string, any>): void {
    const existing = (this.layers.shared.get('contextRepairNotes')?.value as any[]) || [];
    existing.push({
      note,
      metadata,
      recordedAt: new Date().toISOString(),
    });
    this.set('shared', 'contextRepairNotes', existing);
  }

  fingerprint(): string {
    const payload: Record<string, any> = {};
    (Object.keys(this.layers) as ContextLayerType[]).forEach(layer => {
      payload[layer] = Array.from(this.layers[layer].entries()).map(([key, value]) => ({
        key,
        version: value.version,
        updatedAt: value.updatedAt,
      }));
    });
    return createHash('sha1').update(JSON.stringify(payload)).digest('hex');
  }

  getVersion(): number {
    return this.versionCounter;
  }

  private isExpired(entry: ContextEntry): boolean {
    return !!(entry.expiresAt && entry.expiresAt < Date.now());
  }
}
