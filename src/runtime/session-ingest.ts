/**
 * SessionIngestService
 *
 * Receives batched SDK telemetry, stores it, detects friction signals via
 * synchronous rule-based scoring (< 5ms target), and publishes
 * FRICTION_DETECTED events when signals cross configured thresholds.
 *
 * This is NOT an agent — it runs inline on every ingest request.
 */

import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../storage/database';
import { EventBus, EventType } from '../core/event-bus';
import { Severity, RuntimeConfig } from '../types';
import Logger from '../utils/logger';

export interface IngestPayload {
  appId: string;
  userSessionId: string;
  anonymousId?: string;
  cohortId?: string;
  userAgent?: string;
  pageUrl: string;
  events: Array<{
    id: string;
    type: string;
    timestamp: number;
    url: string;
    selector?: string;
    elementText?: string;
    position?: { x: number; y: number };
    viewport?: { width: number; height: number };
    value?: string;
    metadata?: Record<string, any>;
  }>;
}

export interface IngestResult {
  sessionId: string;
  cohortId?: string;
  mutations: any[];   // UIMutation objects for this session's cohort
  frictionDetected: boolean;
}

// Friction signal types and their severity mapping
const FRICTION_SEVERITY: Record<string, Severity> = {
  rage_click: Severity.HIGH,
  dead_click: Severity.MEDIUM,
  form_abandonment: Severity.MEDIUM,
  js_error: Severity.HIGH,
  error_click: Severity.MEDIUM,
  scroll_depth_low: Severity.LOW,
  slow_interaction: Severity.LOW,
};

export class SessionIngestService {
  private db: DatabaseManager;
  private eventBus: EventBus;
  private logger: Logger;
  private runtimeConfig: RuntimeConfig;

  // In-memory dedup cache: (appId|type|url|selector) → lastDetectedAt
  private signalDedup = new Map<string, number>();
  private readonly DEDUP_WINDOW_MS = 60 * 60 * 1000; // 1 hour

  constructor(db: DatabaseManager, eventBus: EventBus, runtimeConfig: RuntimeConfig) {
    this.db = db;
    this.eventBus = eventBus;
    this.runtimeConfig = runtimeConfig;
    this.logger = new Logger('SESSION_INGEST');

    // Periodically clear dedup cache
    setInterval(() => this.cleanDedupCache(), 10 * 60 * 1000);
  }

  /**
   * Process an ingest payload from the SDK. Returns mutations for this session.
   */
  async ingest(payload: IngestPayload): Promise<IngestResult> {
    const now = Date.now();

    // 1. Upsert user session
    this.db.upsertUserSession({
      id: payload.userSessionId,
      appId: payload.appId,
      cohortId: payload.cohortId ?? undefined,
      startedAt: payload.events[0]?.timestamp ?? now,
      lastSeenAt: now,
      pageUrl: payload.pageUrl,
      userAgent: payload.userAgent,
    });

    // 2. Store events (batch insert)
    const receivedAt = now;
    const dbEvents = payload.events.map(e => ({ ...e, receivedAt }));
    if (dbEvents.length > 0) {
      this.db.saveSessionEvents(dbEvents as any);
    }

    // 3. Detect friction signals synchronously
    const frictionEvents = payload.events.filter(e =>
      Object.keys(FRICTION_SEVERITY).includes(e.type)
    );
    let frictionDetected = false;

    for (const evt of frictionEvents) {
      const signal = this.detectSignal(payload.appId, payload.userSessionId, evt);
      if (signal) {
        frictionDetected = true;
        this.db.saveFrictionSignal(signal);

        this.eventBus.emit({
          type: EventType.FRICTION_DETECTED,
          sessionId: payload.userSessionId,
          timestamp: now,
          data: { signal, appId: payload.appId },
          metadata: { source: 'session-ingest', appId: payload.appId },
        });

        // Check if threshold exceeded for this signal type
        if (this.isThresholdExceeded(payload.appId, evt)) {
          this.eventBus.emit({
            type: EventType.FRICTION_THRESHOLD_EXCEEDED,
            sessionId: payload.userSessionId,
            timestamp: now,
            data: { signal, appId: payload.appId },
            metadata: { source: 'session-ingest', appId: payload.appId },
          });
          this.logger.info(`Friction threshold exceeded: ${evt.type} on ${evt.url}`);
        }
      }
    }

    // 4. Resolve mutations for this session's cohort
    const mutations = this.getMutationsForSession(payload.userSessionId, payload.appId);

    // 5. Emit SESSION_INGESTED
    this.eventBus.emit({
      type: EventType.SESSION_INGESTED,
      sessionId: payload.userSessionId,
      timestamp: now,
      data: { eventCount: payload.events.length, frictionDetected },
      metadata: { source: 'session-ingest', appId: payload.appId },
    });

    return {
      sessionId: payload.userSessionId,
      cohortId: payload.cohortId ?? undefined,
      mutations,
      frictionDetected,
    };
  }

  /**
   * Register a new session (called by POST /api/sdk/session).
   * Returns cohort assignments and any active mutations.
   */
  registerSession(payload: {
    appId: string;
    userSessionId: string;
    pageUrl: string;
    userAgent?: string;
  }): { sessionId: string; cohortId?: string; mutations: any[] } {
    const now = Date.now();

    this.db.upsertUserSession({
      id: payload.userSessionId,
      appId: payload.appId,
      startedAt: now,
      lastSeenAt: now,
      pageUrl: payload.pageUrl,
      userAgent: payload.userAgent,
    });

    const mutations = this.getMutationsForSession(payload.userSessionId, payload.appId);
    const session = this.db.getUserSession(payload.userSessionId);

    return {
      sessionId: payload.userSessionId,
      cohortId: session?.cohortId ?? undefined,
      mutations,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Rule-based friction signal detection. Returns a signal record or null.
   */
  private detectSignal(
    appId: string,
    userSessionId: string,
    evt: IngestPayload['events'][0]
  ): ReturnType<DatabaseManager['getFrictionSignal']> | null {
    const type = evt.type as keyof typeof FRICTION_SEVERITY;
    const severity = FRICTION_SEVERITY[type];
    if (!severity) return null;

    // Dedup: don't create duplicate signals for same (type, url, selector) within window
    const dedupKey = `${appId}|${type}|${evt.url}|${evt.selector ?? ''}`;
    const lastSeen = this.signalDedup.get(dedupKey);
    if (lastSeen && Date.now() - lastSeen < this.DEDUP_WINDOW_MS) return null;
    this.signalDedup.set(dedupKey, Date.now());

    // Threshold checks by type
    const threshold = this.runtimeConfig.frictionThreshold;
    let shouldFire = false;

    switch (type) {
      case 'rage_click':
        shouldFire = (evt.metadata?.clickCount ?? 1) >= threshold.rageClicks ||
          // Always fire on rage_click events — the SDK already rate-limits them
          true;
        break;
      case 'form_abandonment':
        shouldFire = (evt.metadata?.fieldCount ?? 0) >= threshold.formAbandonmentMinFields;
        break;
      case 'js_error':
        shouldFire = true;
        break;
      case 'dead_click':
        shouldFire = true;
        break;
      case 'error_click':
        shouldFire = true;
        break;
      case 'scroll_depth_low':
        shouldFire = (evt.metadata?.depthPercent ?? 100) <= 25;
        break;
      default:
        shouldFire = true;
    }

    if (!shouldFire) return null;

    return {
      id: uuidv4(),
      userSessionId,
      appId,
      type,
      url: evt.url,
      selector: evt.selector,
      elementText: evt.elementText,
      count: 1,
      severity,
      context: evt.metadata,
      detectedAt: evt.timestamp,
    };
  }

  /**
   * Check if a friction signal type has exceeded the configured threshold
   * within the past hour (looking at DB counts, not just this batch).
   */
  private isThresholdExceeded(appId: string, evt: IngestPayload['events'][0]): boolean {
    const threshold = this.runtimeConfig.frictionThreshold;
    const oneHourAgo = Date.now() - this.DEDUP_WINDOW_MS;

    try {
      const count = this.db.countSessionEventsByType(appId, evt.type, evt.url, oneHourAgo);
      switch (evt.type) {
        case 'rage_click': return count >= threshold.rageClicks * 5;
        case 'form_abandonment': return count >= 10;
        case 'js_error': return count >= 5;
        default: return count >= 20;
      }
    } catch {
      return false;
    }
  }

  /**
   * Look up which mutations this session should see based on cohort assignments.
   */
  private getMutationsForSession(userSessionId: string, appId: string): any[] {
    try {
      // Get all running experiments for this app
      const experiments = this.db.getExperiments(appId, 'RUNNING');
      const mutations: any[] = [];

      for (const exp of experiments) {
        // Check if this session already has a cohort assignment
        let assignment = this.db.getCohortAssignment(userSessionId, exp.id);

        if (!assignment) {
          // Assign cohort deterministically: hash(sessionId + experimentId)
          const cohortId = this.assignCohort(userSessionId, exp.id, exp.trafficPercent);
          if (cohortId) {
            this.db.saveCohortAssignment({
              userSessionId, experimentId: exp.id, cohortId, assignedAt: Date.now(),
            });
            this.db.upsertUserSession({
              id: userSessionId,
              appId,
              cohortId,
              startedAt: Date.now(),
              lastSeenAt: Date.now(),
              pageUrl: '',
            });
            this.eventBus.emit({
              type: EventType.COHORT_ASSIGNED,
              sessionId: userSessionId,
              timestamp: Date.now(),
              data: { experimentId: exp.id, cohortId },
            });
            assignment = { userSessionId, experimentId: exp.id, cohortId, assignedAt: Date.now() };
          }
        }

        if (assignment?.cohortId === exp.variantCohortId || assignment?.cohortId === 'variant') {
          const expMutations = this.db.getUIMutations(exp.id);
          mutations.push(...expMutations);
        }
      }

      return mutations;
    } catch (err) {
      this.logger.error('Failed to resolve mutations for session', err as Error);
      return [];
    }
  }

  /**
   * Deterministic cohort assignment.
   * Returns 'variant' if the session falls within trafficPercent, 'control' otherwise.
   * Uses a simple hash so the same session always gets the same cohort.
   */
  private assignCohort(
    userSessionId: string,
    experimentId: string,
    trafficPercent: number
  ): 'control' | 'variant' | null {
    // Simple deterministic hash
    const str = `${userSessionId}${experimentId}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    const bucket = Math.abs(hash) % 100;
    return bucket < trafficPercent ? 'variant' : 'control';
  }

  private cleanDedupCache(): void {
    const cutoff = Date.now() - this.DEDUP_WINDOW_MS;
    for (const [key, ts] of this.signalDedup.entries()) {
      if (ts < cutoff) this.signalDedup.delete(key);
    }
  }
}

export default SessionIngestService;
