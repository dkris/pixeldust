import { Agent, AgentType, AgentContext, AgentResult } from '../types';
import Logger from '../utils/logger';
import { DatabaseManager } from '../storage/database';
import { v4 as uuidv4 } from 'uuid';

/**
 * Base agent class with common functionality including:
 * - Memory management (short-term, long-term, episodic)
 * - Execution tracking for observability
 * - Performance metrics collection
 */
export abstract class BaseAgent implements Agent {
  protected logger: Logger;
  protected db?: DatabaseManager;

  constructor(public type: AgentType, db?: DatabaseManager) {
    this.logger = new Logger(type);
    this.db = db;
  }

  /**
   * Execute the agent with automatic tracking and error handling
   */
  abstract execute(context: AgentContext): Promise<AgentResult>;

  /**
   * Execute with automatic performance tracking
   * Child classes should call this wrapper for observability
   */
  protected async executeWithTracking(
    context: AgentContext,
    executeFn: () => Promise<AgentResult>
  ): Promise<AgentResult> {
    const startTime = Date.now();
    const executionId = uuidv4();

    try {
      const result = await executeFn();
      const durationMs = Date.now() - startTime;

      // Track execution metrics
      if (this.db && context.session?.id) {
        await this.trackExecution({
          id: executionId,
          agentType: this.type,
          sessionId: context.session.id,
          durationMs,
          tokensUsed: result.tokensUsed,
          success: result.success,
          metrics: result.data,
        });
      }

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      // Track failed execution
      if (this.db && context.session?.id) {
        await this.trackExecution({
          id: executionId,
          agentType: this.type,
          sessionId: context.session.id,
          durationMs,
          success: false,
          error: (error as Error).message,
        });
      }

      throw error;
    }
  }

  /**
   * Store a memory for this agent
   */
  protected async storeMemory(
    key: string,
    value: any,
    options?: {
      memoryType?: 'short_term' | 'long_term' | 'episodic';
      sessionId?: string;
      context?: any;
      expiresInMs?: number;
    }
  ): Promise<void> {
    if (!this.db) return;

    const memoryType = options?.memoryType || 'long_term';
    const expiresAt = options?.expiresInMs
      ? Date.now() + options.expiresInMs
      : undefined;

    await this.db.storeMemory({
      id: uuidv4(),
      agentType: this.type,
      sessionId: options?.sessionId,
      memoryType,
      key,
      value,
      context: options?.context,
      expiresAt,
    });

    this.logger.debug(`Stored ${memoryType} memory: ${key}`);
  }

  /**
   * Recall a memory for this agent
   */
  protected async recallMemory(key: string): Promise<any | null> {
    if (!this.db) return null;

    const memory = await this.db.recallMemory(this.type, key);
    if (memory) {
      this.logger.debug(`Recalled memory: ${key}`);
      return memory.value;
    }

    return null;
  }

  /**
   * Recall all memories of a specific type
   */
  protected async recallMemoriesByType(
    memoryType: 'short_term' | 'long_term' | 'episodic'
  ): Promise<any[]> {
    if (!this.db) return [];

    const memories = await this.db.recallMemoriesByType(this.type, memoryType);
    return memories.map(m => ({ key: m.key, value: m.value, context: m.context }));
  }

  /**
   * Track agent execution for observability
   */
  private async trackExecution(execution: {
    id: string;
    agentType: string;
    sessionId: string;
    durationMs: number;
    tokensUsed?: number;
    success: boolean;
    error?: string;
    metrics?: any;
  }): Promise<void> {
    if (!this.db) return;

    try {
      await this.db.trackAgentExecution(execution);
    } catch (error) {
      this.logger.warn('Failed to track execution', error);
    }
  }

  protected success(data?: any, nextState?: any, tokensUsed?: number): AgentResult {
    return {
      success: true,
      data,
      nextState,
      tokensUsed,
    };
  }

  protected failure(error: Error, nextState?: any): AgentResult {
    this.logger.error(`Agent ${this.type} failed`, error);
    return {
      success: false,
      error,
      nextState,
    };
  }
}

export default BaseAgent;
