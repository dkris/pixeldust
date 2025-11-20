import type { DatabaseManager } from '../../storage/database';
import {
  AgentContext,
  AgentType,
  Config,
  Session,
  SessionState,
} from '../../types';
import { EventType } from '../../core/event-bus';

type AgentConstructor = new (...args: any[]) => any;

// Import BaseAgent before defining the mock function
import { BaseAgent } from '../base-agent';

function createMockAgent(agentType: AgentType): AgentConstructor {
  return class extends BaseAgent {
    constructor(...args: any[]) {
      super(agentType, args[0]);
    }

    async execute() {
      return {
        success: true,
        data: { agent: agentType },
      };
    }
  };
}

jest.mock('../application-loader-agent', () => ({
  ApplicationLoaderAgent: createMockAgent(AgentType.APPLICATION_LOADER),
}));

jest.mock('../environment-agent', () => ({
  EnvironmentAgent: createMockAgent(AgentType.ENVIRONMENT),
}));

jest.mock('../workflow-discovery-agent', () => ({
  WorkflowDiscoveryAgent: createMockAgent(AgentType.WORKFLOW_DISCOVERY),
}));

jest.mock('../test-generation-agent', () => ({
  TestGenerationAgent: createMockAgent(AgentType.TEST_GENERATION),
}));

jest.mock('../execution-agent', () => ({
  ExecutionAgent: createMockAgent(AgentType.EXECUTION),
}));

jest.mock('../analysis-agent', () => ({
  AnalysisAgent: createMockAgent(AgentType.ANALYSIS),
}));

jest.mock('../dependency-upgrade-agent', () => ({
  DependencyUpgradeAgent: createMockAgent(AgentType.DEPENDENCY_UPGRADE),
}));

jest.mock('../test-fixing-agent', () => ({
  TestFixingAgent: createMockAgent(AgentType.TEST_FIXING),
}));

jest.mock('../remediation-agent', () => ({
  RemediationAgent: createMockAgent(AgentType.REMEDIATION),
}));

jest.mock('../implementation-agent', () => ({
  ImplementationAgent: createMockAgent(AgentType.IMPLEMENTATION),
}));

jest.mock('../review-agent', () => ({
  ReviewAgent: createMockAgent(AgentType.REVIEW),
}));

jest.mock('../evaluation-agent', () => ({
  EvaluationAgent: createMockAgent(AgentType.EVALUATION),
}));

// Import after all mocks are defined
import { HybridOrchestratorAgent } from '../hybrid-orchestrator-agent';

const mockDb = {
  updateSessionState: jest.fn(),
  trackAgentExecution: jest.fn(),
  storeMemory: jest.fn(),
  recallMemory: jest.fn(),
  recallMemoriesByType: jest.fn(),
} as unknown as DatabaseManager;

const baseConfig: Config = {
  framework: { name: '@ui5/webcomponents', versions: ['1.0.0'] },
  components: {},
  containers: {
    runtime: 'docker',
    baseImage: 'node:18',
    resources: { memory: '1g', cpu: 1 },
  },
  testing: {
    browsers: ['chromium'],
    viewport: { width: 1280, height: 720 },
    timeout: 60000,
    retries: 0,
  },
  analysis: { visualThreshold: 0.1 },
  ai: { provider: 'openai', model: 'gpt-4o-mini' },
  storage: { type: 'local', path: './artifacts' },
  reporting: { format: ['json'], outputPath: './reports' },
  application: {
    path: '.',
    buildCommand: 'npm run build',
    startCommand: 'npm run start',
    port: 3000,
  },
  workflowDiscovery: { driver: 'local' },
  forceRegenerateTests: false,
};

const session: Session = {
  id: 'session-hybrid',
  state: SessionState.INITIALIZING,
  config: baseConfig,
  versions: ['1.0.0', '2.0.0'],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('Hybrid orchestrator workflow discovery integration', () => {
  it('emits workflow discovery events before test generation', async () => {
    const orchestrator = new HybridOrchestratorAgent(mockDb);
    const context = { session, config: baseConfig } as AgentContext;

    const result = await orchestrator.execute(context);
    expect(result.success).toBe(true);

    const eventBus = (orchestrator as any).eventBus;
    const events = eventBus.getHistory({ sessionId: session.id });

    const workflowEventIndex = events.findIndex(
      (event: any) =>
        event.type === EventType.STAGE_COMPLETED &&
        event.metadata?.stageName === AgentType.WORKFLOW_DISCOVERY
    );
    const testGenerationEventIndex = events.findIndex(
      (event: any) => event.type === EventType.TEST_GENERATION_STARTED
    );

    expect(workflowEventIndex).toBeGreaterThanOrEqual(0);
    expect(testGenerationEventIndex).toBeGreaterThanOrEqual(0);
    expect(workflowEventIndex).toBeLessThan(testGenerationEventIndex);
  });
});
