import { Agent, AgentType, AgentContext, AgentResult } from '../types';
import Logger from '../utils/logger';

/**
 * Base agent class with common functionality
 */
export abstract class BaseAgent implements Agent {
  protected logger: Logger;

  constructor(public type: AgentType) {
    this.logger = new Logger(type);
  }

  abstract execute(context: AgentContext): Promise<AgentResult>;

  protected success(data?: any, nextState?: any): AgentResult {
    return {
      success: true,
      data,
      nextState,
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
