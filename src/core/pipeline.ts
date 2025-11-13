import { Session, SessionState, Config } from '../types';
import { EventBus, EventType, EventPayload } from './event-bus';
import Logger from '../utils/logger';

/**
 * Pipeline Stage Context
 * Immutable context passed between pipeline stages
 */
export class StageContext {
  private data: Map<string, any>;
  private parent?: StageContext;

  constructor(
    public readonly session: Session,
    public readonly config: Config,
    public readonly eventBus: EventBus,
    data?: Map<string, any>,
    parent?: StageContext
  ) {
    this.data = data || new Map();
    this.parent = parent;
  }

  /**
   * Get value from context (checks parent chain)
   */
  get<T>(key: string): T | undefined {
    if (this.data.has(key)) {
      return this.data.get(key) as T;
    }
    return this.parent?.get<T>(key);
  }

  /**
   * Create new context with added data (immutable)
   */
  with(key: string, value: any): StageContext {
    const newData = new Map(this.data);
    newData.set(key, value);
    return new StageContext(
      this.session,
      this.config,
      this.eventBus,
      newData,
      this
    );
  }

  /**
   * Create new context with multiple values
   */
  withMany(values: Record<string, any>): StageContext {
    const newData = new Map(this.data);
    Object.entries(values).forEach(([k, v]) => newData.set(k, v));
    return new StageContext(
      this.session,
      this.config,
      this.eventBus,
      newData,
      this
    );
  }

  /**
   * Get all data as object (for debugging)
   */
  toObject(): Record<string, any> {
    const obj: Record<string, any> = {};

    // Add parent data first
    if (this.parent) {
      Object.assign(obj, this.parent.toObject());
    }

    // Add own data (overwrites parent if duplicate keys)
    this.data.forEach((value, key) => {
      obj[key] = value;
    });

    return obj;
  }

  /**
   * Emit event through event bus
   */
  emit(type: EventType, data?: any, metadata?: any): void {
    this.eventBus.emit({
      type,
      sessionId: this.session.id,
      timestamp: Date.now(),
      data,
      metadata,
    });
  }
}

/**
 * Pipeline Stage Result
 */
export interface StageResult {
  success: boolean;
  data?: any;
  error?: Error;
  insertAfter?: PipelineStage[];  // Dynamic stage injection
  metadata?: {
    duration?: number;
    [key: string]: any;
  };
}

/**
 * Pipeline Stage Interface
 */
export interface PipelineStage {
  /**
   * Unique stage name
   */
  name: string;

  /**
   * Stage dependencies (other stage names)
   */
  dependencies: string[];

  /**
   * Can this stage run in parallel with others?
   */
  canRunInParallel: boolean;

  /**
   * Execute the stage
   */
  execute(context: StageContext): Promise<StageResult>;

  /**
   * Optional: Cleanup after execution
   */
  cleanup?(): Promise<void>;
}

/**
 * Base Pipeline Stage Implementation
 */
export abstract class BasePipelineStage implements PipelineStage {
  protected logger: Logger;

  constructor(
    public name: string,
    public dependencies: string[] = [],
    public canRunInParallel: boolean = false
  ) {
    this.logger = new Logger(`STAGE:${name.toUpperCase()}`);
  }

  abstract execute(context: StageContext): Promise<StageResult>;

  protected success(data?: any, metadata?: any): StageResult {
    return {
      success: true,
      data,
      metadata,
    };
  }

  protected failure(error: Error, metadata?: any): StageResult {
    this.logger.error(`Stage ${this.name} failed`, error);
    return {
      success: false,
      error,
      metadata,
    };
  }

  async cleanup(): Promise<void> {
    // Override if cleanup needed
  }
}

/**
 * Pipeline Execution Result
 */
export interface PipelineResult {
  success: boolean;
  session: Session;
  finalContext: StageContext;
  error?: Error;
  executedStages: string[];
  failedStage?: string;
  totalDuration: number;
}

/**
 * Pipeline Executor
 * Executes stages in dependency order with event emission
 */
export class PipelineExecutor {
  private logger: Logger;

  constructor(private eventBus: EventBus) {
    this.logger = new Logger('PIPELINE_EXECUTOR');
  }

  /**
   * Execute pipeline stages
   */
  async execute(
    stages: PipelineStage[],
    initialContext: StageContext
  ): Promise<PipelineResult> {
    const startTime = Date.now();
    const executedStages: string[] = [];
    let context = initialContext;
    let failedStage: string | undefined;

    try {
      // Emit session started event
      context.emit(EventType.SESSION_STARTED, {
        stageCount: stages.length,
      });

      // Execute stages in dependency order
      const sortedStages = this.topologicalSort(stages);

      for (const stage of sortedStages) {
        // Wait for dependencies to complete
        const dependenciesCompleted = stage.dependencies.every(dep =>
          executedStages.includes(dep)
        );

        if (!dependenciesCompleted) {
          throw new Error(
            `Stage ${stage.name} dependencies not met: ${stage.dependencies.join(', ')}`
          );
        }

        // Emit stage started event
        context.emit(EventType.STAGE_STARTED, null, { stageName: stage.name });
        this.logger.info(`Executing stage: ${stage.name}`);

        const stageStartTime = Date.now();

        try {
          // Execute stage
          const result = await stage.execute(context);

          if (!result.success) {
            failedStage = stage.name;
            context.emit(EventType.STAGE_FAILED, {
              error: result.error?.message,
            }, { stageName: stage.name });

            throw result.error || new Error(`Stage ${stage.name} failed`);
          }

          const stageDuration = Date.now() - stageStartTime;

          // Update context with stage result
          if (result.data) {
            context = context.with(stage.name, result.data);
          }

          // Emit stage completed event
          context.emit(EventType.STAGE_COMPLETED, {
            duration: stageDuration,
            ...result.data,
          }, { stageName: stage.name });

          executedStages.push(stage.name);

          this.logger.info(
            `Stage ${stage.name} completed in ${stageDuration}ms`
          );

          // Handle dynamic stage injection
          if (result.insertAfter && result.insertAfter.length > 0) {
            this.logger.info(
              `Stage ${stage.name} requested ${result.insertAfter.length} additional stages`
            );
            stages.splice(
              stages.indexOf(stage) + 1,
              0,
              ...result.insertAfter
            );
          }
        } catch (error) {
          failedStage = stage.name;
          throw error;
        } finally {
          // Cleanup stage resources
          if (stage.cleanup) {
            await stage.cleanup();
          }
        }
      }

      const totalDuration = Date.now() - startTime;

      // Emit session completed event
      context.emit(EventType.SESSION_COMPLETED, {
        executedStages: executedStages.length,
        totalDuration,
      });

      return {
        success: true,
        session: context.session,
        finalContext: context,
        executedStages,
        totalDuration,
      };
    } catch (error) {
      const totalDuration = Date.now() - startTime;

      // Emit session failed event
      context.emit(EventType.SESSION_FAILED, {
        error: (error as Error).message,
        failedStage,
      });

      return {
        success: false,
        session: context.session,
        finalContext: context,
        error: error as Error,
        executedStages,
        failedStage,
        totalDuration,
      };
    }
  }

  /**
   * Topological sort of stages based on dependencies
   * Uses Kahn's algorithm
   */
  private topologicalSort(stages: PipelineStage[]): PipelineStage[] {
    const sorted: PipelineStage[] = [];
    const inDegree = new Map<string, number>();
    const stageMap = new Map<string, PipelineStage>();

    // Build stage map and calculate in-degrees
    stages.forEach(stage => {
      stageMap.set(stage.name, stage);
      inDegree.set(stage.name, stage.dependencies.length);
    });

    // Queue of stages with no dependencies
    const queue: PipelineStage[] = stages.filter(
      stage => stage.dependencies.length === 0
    );

    while (queue.length > 0) {
      const stage = queue.shift()!;
      sorted.push(stage);

      // Find stages that depend on this one
      stages.forEach(s => {
        if (s.dependencies.includes(stage.name)) {
          const degree = inDegree.get(s.name)! - 1;
          inDegree.set(s.name, degree);

          if (degree === 0) {
            queue.push(s);
          }
        }
      });
    }

    // Check for circular dependencies
    if (sorted.length !== stages.length) {
      const missing = stages
        .filter(s => !sorted.includes(s))
        .map(s => s.name);
      throw new Error(
        `Circular dependency detected in pipeline. Affected stages: ${missing.join(', ')}`
      );
    }

    return sorted;
  }

  /**
   * Validate pipeline stages before execution
   */
  validate(stages: PipelineStage[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const stageNames = new Set(stages.map(s => s.name));

    // Check for duplicate stage names
    if (stageNames.size !== stages.length) {
      errors.push('Duplicate stage names found');
    }

    // Check for invalid dependencies
    stages.forEach(stage => {
      stage.dependencies.forEach(dep => {
        if (!stageNames.has(dep)) {
          errors.push(
            `Stage ${stage.name} depends on non-existent stage: ${dep}`
          );
        }
      });
    });

    // Check for circular dependencies
    try {
      this.topologicalSort(stages);
    } catch (error) {
      errors.push((error as Error).message);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

export default PipelineExecutor;
