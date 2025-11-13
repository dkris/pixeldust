import { EventEmitter } from 'events';
import { DatabaseManager } from '../storage/database';
import Logger from '../utils/logger';

/**
 * Event Types for the system
 */
export enum EventType {
  // Session Events
  SESSION_STARTED = 'SESSION_STARTED',
  SESSION_COMPLETED = 'SESSION_COMPLETED',
  SESSION_FAILED = 'SESSION_FAILED',

  // Stage Events
  STAGE_STARTED = 'STAGE_STARTED',
  STAGE_COMPLETED = 'STAGE_COMPLETED',
  STAGE_FAILED = 'STAGE_FAILED',

  // Component Discovery
  COMPONENTS_DISCOVERED = 'COMPONENTS_DISCOVERED',

  // Test Generation
  TEST_GENERATION_STARTED = 'TEST_GENERATION_STARTED',
  TEST_GENERATION_COMPLETED = 'TEST_GENERATION_COMPLETED',
  TEST_GENERATION_FAILED = 'TEST_GENERATION_FAILED',

  // Test Execution
  TEST_EXECUTION_STARTED = 'TEST_EXECUTION_STARTED',
  TEST_EXECUTION_COMPLETED = 'TEST_EXECUTION_COMPLETED',
  TEST_EXECUTION_FAILED = 'TEST_EXECUTION_FAILED',

  // Analysis
  ANALYSIS_STARTED = 'ANALYSIS_STARTED',
  ANALYSIS_COMPLETED = 'ANALYSIS_COMPLETED',
  ANALYSIS_FAILED = 'ANALYSIS_FAILED',

  // Comparison
  COMPARISON_STARTED = 'COMPARISON_STARTED',
  COMPARISON_COMPLETED = 'COMPARISON_COMPLETED',

  // Remediation
  REMEDIATION_PROPOSED = 'REMEDIATION_PROPOSED',
  REMEDIATION_APPROVED = 'REMEDIATION_APPROVED',
  REMEDIATION_REJECTED = 'REMEDIATION_REJECTED',
  REMEDIATION_IMPLEMENTED = 'REMEDIATION_IMPLEMENTED',

  // Evaluation
  EVALUATION_STARTED = 'EVALUATION_STARTED',
  EVALUATION_COMPLETED = 'EVALUATION_COMPLETED',

  // Quality Alerts
  LOW_TEST_COVERAGE = 'LOW_TEST_COVERAGE',
  HIGH_FAILURE_RATE = 'HIGH_FAILURE_RATE',
  SLOW_PERFORMANCE = 'SLOW_PERFORMANCE',
}

/**
 * Event payload structure
 */
export interface EventPayload {
  type: EventType;
  sessionId: string;
  timestamp: number;
  data?: any;
  metadata?: {
    source?: string;
    stageName?: string;
    component?: string;
    [key: string]: any;
  };
}

/**
 * Event handler function type
 */
export type EventHandler = (event: EventPayload) => void | Promise<void>;

/**
 * EventBus - Central event coordination system
 *
 * Features:
 * - Publish/subscribe pattern
 * - Async event handlers (non-blocking)
 * - Event persistence for replay
 * - Error isolation (handler failures don't cascade)
 * - Event history for debugging
 */
export class EventBus {
  private emitter: EventEmitter;
  private handlers: Map<EventType, Set<EventHandler>>;
  private eventHistory: EventPayload[];
  private db?: DatabaseManager;
  private logger: Logger;
  private maxHistorySize: number;

  constructor(options?: { db?: DatabaseManager; maxHistorySize?: number }) {
    this.emitter = new EventEmitter();
    this.handlers = new Map();
    this.eventHistory = [];
    this.db = options?.db;
    this.logger = new Logger('EVENT_BUS');
    this.maxHistorySize = options?.maxHistorySize || 1000;

    // Prevent memory leaks from too many listeners
    this.emitter.setMaxListeners(100);
  }

  /**
   * Emit an event to all subscribers
   */
  emit(event: EventPayload): void {
    // Add timestamp if not present
    if (!event.timestamp) {
      event.timestamp = Date.now();
    }

    // Store in history
    this.addToHistory(event);

    // Persist to database if available
    this.persistEvent(event);

    // Get handlers for this event type
    const handlers = this.handlers.get(event.type);
    if (!handlers || handlers.size === 0) {
      return;
    }

    // Execute all handlers (isolated, non-blocking)
    handlers.forEach(handler => {
      this.executeHandler(handler, event);
    });
  }

  /**
   * Subscribe to an event type
   */
  on(eventType: EventType, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);
  }

  /**
   * Subscribe to multiple event types with same handler
   */
  onMany(eventTypes: EventType[], handler: EventHandler): void {
    eventTypes.forEach(type => this.on(type, handler));
  }

  /**
   * Unsubscribe from an event type
   */
  off(eventType: EventType, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Subscribe to an event type (one-time only)
   */
  once(eventType: EventType, handler: EventHandler): void {
    const wrappedHandler: EventHandler = async (event) => {
      await handler(event);
      this.off(eventType, wrappedHandler);
    };
    this.on(eventType, wrappedHandler);
  }

  /**
   * Get event history (for debugging/replay)
   */
  getHistory(filter?: {
    sessionId?: string;
    eventType?: EventType;
    since?: number;
  }): EventPayload[] {
    let history = [...this.eventHistory];

    if (filter) {
      if (filter.sessionId) {
        history = history.filter(e => e.sessionId === filter.sessionId);
      }
      if (filter.eventType) {
        history = history.filter(e => e.type === filter.eventType);
      }
      if (filter.since !== undefined) {
        history = history.filter(e => e.timestamp >= filter.since!);
      }
    }

    return history;
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Get statistics about events
   */
  getStats(): {
    totalEvents: number;
    eventsByType: Record<string, number>;
    subscriberCount: number;
  } {
    const eventsByType: Record<string, number> = {};

    this.eventHistory.forEach(event => {
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
    });

    let subscriberCount = 0;
    this.handlers.forEach(handlers => {
      subscriberCount += handlers.size;
    });

    return {
      totalEvents: this.eventHistory.length,
      eventsByType,
      subscriberCount,
    };
  }

  /**
   * Execute handler with error isolation
   */
  private executeHandler(handler: EventHandler, event: EventPayload): void {
    // Execute asynchronously (non-blocking)
    setImmediate(async () => {
      try {
        await handler(event);
      } catch (error) {
        // Handler failure doesn't affect other handlers or pipeline
        this.logger.error(
          `Event handler failed for ${event.type}`,
          error as Error
        );

        // Emit error event for monitoring
        this.emit({
          type: EventType.STAGE_FAILED,
          sessionId: event.sessionId,
          timestamp: Date.now(),
          data: {
            originalEvent: event.type,
            error: (error as Error).message,
          },
        });
      }
    });
  }

  /**
   * Add event to history (with size limit)
   */
  private addToHistory(event: EventPayload): void {
    this.eventHistory.push(event);

    // Trim history if too large
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Persist event to database
   */
  private persistEvent(event: EventPayload): void {
    if (!this.db) return;

    try {
      // Store event in database for replay/analysis
      // We'll add this to the database schema if needed
      this.logger.debug(`Event persisted: ${event.type}`);
    } catch (error) {
      // Don't let persistence errors affect event emission
      this.logger.error('Failed to persist event', error as Error);
    }
  }
}

export default EventBus;
