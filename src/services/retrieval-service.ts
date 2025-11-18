export interface RetrievalRecord {
  id: string;
  payload: any;
  tags: string[];
  score: number;
  metadata?: Record<string, any>;
  fingerprint: string;
  timestamp: number;
}

export interface RetrievalIndexOptions {
  idKey?: string;
  tagExtractor?: (payload: any) => string[];
  scoreExtractor?: (payload: any) => number;
  metadataExtractor?: (payload: any) => Record<string, any>;
  fingerprint: string;
}

export interface RetrievalRequestOptions {
  limit?: number;
  tags?: string[];
  metadata?: Record<string, any>;
  filter?: (record: RetrievalRecord) => boolean;
  sortBy?: 'score' | 'recency';
}

export class RetrievalService {
  private indexes: Map<string, RetrievalRecord[]> = new Map();

  index(scope: string, payloads: any[], options: RetrievalIndexOptions): void {
    if (payloads.length === 0) return;
    const records = payloads.map(payload => this.toRecord(payload, options));
    const existing = this.indexes.get(scope) || [];
    this.indexes.set(scope, [...records, ...existing].slice(0, 200));
  }

  request(scope: string, options?: RetrievalRequestOptions): RetrievalRecord[] {
    const records = [...(this.indexes.get(scope) || [])];
    let filtered = records;

    if (options?.tags && options.tags.length > 0) {
      filtered = filtered.filter(record => options.tags!.some(tag => record.tags.includes(tag)));
    }

    if (options?.metadata) {
      filtered = filtered.filter(record => {
        return Object.entries(options.metadata!).every(([key, value]) => record.metadata?.[key] === value);
      });
    }

    if (options?.filter) {
      filtered = filtered.filter(options.filter);
    }

    if (options?.sortBy === 'score') {
      filtered.sort((a, b) => b.score - a.score);
    } else if (options?.sortBy === 'recency') {
      filtered.sort((a, b) => b.timestamp - a.timestamp);
    }

    if (options?.limit) {
      return filtered.slice(0, options.limit);
    }

    return filtered;
  }

  clear(scope?: string): void {
    if (scope) {
      this.indexes.delete(scope);
    } else {
      this.indexes.clear();
    }
  }

  private toRecord(payload: any, options: RetrievalIndexOptions): RetrievalRecord {
    const tags = options.tagExtractor ? options.tagExtractor(payload) : [];
    const score = options.scoreExtractor ? options.scoreExtractor(payload) : 1;
    const metadata = options.metadataExtractor ? options.metadataExtractor(payload) : undefined;
    const idKey = options.idKey || 'id';
    return {
      id: payload[idKey] || `${Date.now()}-${Math.random()}`,
      payload,
      tags,
      score,
      metadata,
      fingerprint: options.fingerprint,
      timestamp: Date.now(),
    };
  }
}
