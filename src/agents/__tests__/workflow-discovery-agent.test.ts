import { WorkflowDiscoveryAgent } from '../workflow-discovery-agent';
import { WorkflowDiscoveryBrowserClient } from '../../services/workflow-discovery/browser-client';
import { LayeredContextManager } from '../../core/context-manager';
import { RetrievalService } from '../../services/retrieval-service';
import { AgentMemory } from '../../services/agent-memory';
import { Config, Session, SessionState } from '../../types';

type MockBrowserClient = WorkflowDiscoveryBrowserClient & {
  start: jest.Mock;
  stop: jest.Mock;
  navigate: jest.Mock;
  getTitle: jest.Mock;
  queryComponents: jest.Mock;
  queryInteractiveElements: jest.Mock;
  extractLinks: jest.Mock;
  getDomSnapshot: jest.Mock;
  captureScreenshot: jest.Mock;
  getConsoleLogs: jest.Mock;
  getPage: jest.Mock;
};

function createMockClient(): MockBrowserClient {
  return {
    start: jest.fn(async () => {}),
    stop: jest.fn(async () => {}),
    navigate: jest.fn(async () => {}),
    getTitle: jest.fn(async () => 'Home'),
    queryComponents: jest.fn(async () => [
      {
        tag: 'ui5-button',
        count: 1,
        selectors: ['ui5-button'],
        visible: true,
        attributes: {},
      },
    ]),
    queryInteractiveElements: jest.fn(async () => [
      {
        type: 'button' as const,
        selector: 'ui5-button',
        text: 'Click me',
      },
    ]),
    extractLinks: jest.fn(async () => []),
    getDomSnapshot: jest.fn(async () => '<html></html>'),
    captureScreenshot: jest.fn(async () => 'base64'),
    getConsoleLogs: jest.fn(async () => ['log']),
    getPage: jest.fn(async () => null),
  };
}

function createConfig(overrides?: Partial<Config>): Config {
  return {
    framework: { name: '@ui5/webcomponents', versions: ['1.0.0'] },
    components: { include: [], exclude: [] },
    containers: {
      runtime: 'docker',
      baseImage: 'node',
      resources: { memory: '1g', cpu: 1 },
    },
    testing: {
      browsers: ['chromium'],
      viewport: { width: 1024, height: 768 },
      timeout: 1000,
      retries: 0,
      headless: true,
    },
    analysis: { visualThreshold: 0.1 },
    ai: { provider: 'anthropic', model: 'claude-3' },
    storage: { type: 'local', path: './data' },
    reporting: { format: ['markdown'], outputPath: './reports' },
    application: {
      path: process.cwd(),
      buildCommand: 'npm run build',
      startCommand: 'npm start',
      port: 3000,
    },
    workflowDiscovery: {
      driver: 'local',
      maxDepth: 2,
      maxPages: 5,
    },
    ...(overrides || {}),
  } as Config;
}

function createContext(config: Config): Parameters<WorkflowDiscoveryAgent['execute']>[0] {
  const layers = new LayeredContextManager();
  const retrieval = new RetrievalService();
  const memory = new AgentMemory();
  const session: Session = {
    id: 'session-1',
    state: SessionState.WORKFLOW_DISCOVERY,
    config,
    versions: config.framework.versions,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return {
    session,
    config,
    data: {},
    layers,
    retrieval,
    memory,
    fingerprint: 'test',
    pruneLayers: jest.fn(),
  };
}

describe('WorkflowDiscoveryAgent', () => {
  it('uses injected browser client and streams artifacts', async () => {
    const mockClient = createMockClient();
    const agent = new WorkflowDiscoveryAgent(undefined, () => mockClient);
    const config = createConfig();
    const context = createContext(config);

    const result = await agent.execute(context);

    expect(result.success).toBe(true);
    expect(result.data?.driver).toBe('local');
    expect(mockClient.navigate).toHaveBeenCalledWith('http://localhost:3000');

    const driverLayer = context.layers.get<any>('workflow.discovery.driver');
    expect(driverLayer).toBeDefined();
    const domArtifacts = context.retrieval.request('workflow-page-dom');
    expect(domArtifacts.length).toBeGreaterThan(0);
  });

  it('honors workflowDiscovery.driver when provided', async () => {
    const mockClient = createMockClient();
    const factory = jest.fn(() => mockClient);
    const agent = new WorkflowDiscoveryAgent(undefined, factory);
    const config = createConfig({
      workflowDiscovery: {
        driver: 'mcp',
        maxDepth: 1,
        maxPages: 1,
        mcp: { endpoint: 'http://localhost:4000' },
      },
    });
    const context = createContext(config);

    const result = await agent.execute(context);

    expect(result.success).toBe(true);
    expect(result.data?.driver).toBe('mcp');
    expect(factory).toHaveBeenCalledWith(config);
  });
});
