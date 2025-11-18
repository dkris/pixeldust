import { AgentType } from '../types';

export interface RetryPolicy {
  maxRetries: number;
  initialDelayMs: number;
  backoffMultiplier: number;
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  cooldownMs: number;
}

interface CircuitState {
  failures: number;
  openedAt?: number;
}

const DEFAULT_RETRY: RetryPolicy = {
  maxRetries: 1,
  initialDelayMs: 250,
  backoffMultiplier: 2,
};

const DEFAULT_BREAKER: CircuitBreakerOptions = {
  failureThreshold: 3,
  cooldownMs: 10_000,
};

export class ResilienceManager {
  private retryPolicies: Map<AgentType, RetryPolicy> = new Map();
  private breakerPolicies: Map<AgentType, CircuitBreakerOptions> = new Map();
  private breakerState: Map<AgentType, CircuitState> = new Map();

  constructor(policies?: {
    retries?: Partial<Record<AgentType, RetryPolicy>>;
    breakers?: Partial<Record<AgentType, CircuitBreakerOptions>>;
  }) {
    if (policies?.retries) {
      Object.entries(policies.retries).forEach(([type, policy]) => {
        this.retryPolicies.set(type as AgentType, policy!);
      });
    }
    if (policies?.breakers) {
      Object.entries(policies.breakers).forEach(([type, policy]) => {
        this.breakerPolicies.set(type as AgentType, policy!);
      });
    }
  }

  async execute<T>(agentType: AgentType, fn: () => Promise<T>): Promise<T> {
    this.ensureBreakerState(agentType);
    await this.ensureBreakerClosed(agentType);

    const policy = this.retryPolicies.get(agentType) || DEFAULT_RETRY;
    let attempt = 0;
    let lastError: any;
    let delay = policy.initialDelayMs;

    while (attempt <= policy.maxRetries) {
      try {
        const result = await fn();
        this.resetBreaker(agentType);
        return result;
      } catch (error) {
        lastError = error;
        this.recordFailure(agentType);
        if (attempt === policy.maxRetries) {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= policy.backoffMultiplier;
        attempt += 1;
      }
    }

    throw lastError;
  }

  private ensureBreakerState(agentType: AgentType): void {
    if (!this.breakerState.has(agentType)) {
      this.breakerState.set(agentType, { failures: 0 });
    }
  }

  private async ensureBreakerClosed(agentType: AgentType): Promise<void> {
    const breaker = this.breakerState.get(agentType)!;
    const policy = this.breakerPolicies.get(agentType) || DEFAULT_BREAKER;
    if (breaker.openedAt && Date.now() - breaker.openedAt < policy.cooldownMs) {
      throw new Error(`Circuit open for ${agentType}, retry after cooldown`);
    }
    if (breaker.openedAt && Date.now() - breaker.openedAt >= policy.cooldownMs) {
      breaker.openedAt = undefined;
      breaker.failures = 0;
    }
  }

  private recordFailure(agentType: AgentType): void {
    const breaker = this.breakerState.get(agentType)!;
    const policy = this.breakerPolicies.get(agentType) || DEFAULT_BREAKER;
    breaker.failures += 1;
    if (breaker.failures >= policy.failureThreshold) {
      breaker.openedAt = Date.now();
    }
  }

  private resetBreaker(agentType: AgentType): void {
    const breaker = this.breakerState.get(agentType)!;
    breaker.failures = 0;
    breaker.openedAt = undefined;
  }
}
