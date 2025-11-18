import { ExecutionAgent } from '../execution-agent';
import { AgentType, Config, Session, SessionState } from '../../types';
import { StageContext } from '../../core/pipeline';
import { EventBus } from '../../core/event-bus';

function createConfig(overrides?: Partial<Config>): Config {
  const base: Config = {
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
  } as Config;

  return { ...base, ...(overrides || {}) };
}

describe('ExecutionAgent', () => {
  it('reads test suites from the TEST_GENERATION stage payload', async () => {
    const config = createConfig();
    const session: Session = {
      id: 'session-exec',
      state: SessionState.TEST_EXECUTION,
      config,
      versions: ['1.0.0'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const baseContext = new StageContext(session, config, new EventBus());
    const testSuites = [
      {
        id: 'suite-1',
        name: 'Suite 1',
        tests: [
          { id: 'test-1', name: 'Test 1', category: 'FUNCTIONAL' },
          { id: 'test-2', name: 'Test 2', category: 'VISUAL' },
        ],
      },
    ];

    const stageContext = baseContext.with(AgentType.TEST_GENERATION, { testSuites });
    const agentContext = stageContext.createAgentContext(stageContext.toObject());

    const agent = new ExecutionAgent();
    const runTestMock = jest
      .spyOn(agent as any, 'runTest')
      .mockImplementation(async (test: any) => ({
        id: test.id,
        testId: test.id,
        sessionId: session.id,
        version: session.versions[0],
        status: 'passed',
        duration: 1,
        screenshots: [],
        executedAt: new Date(),
      }));

    const mockBrowser = { close: jest.fn() };
    jest.spyOn(agent as any, 'launchBrowser').mockResolvedValue(mockBrowser);
    jest.spyOn(agent as any, 'collectMetrics').mockResolvedValue({});

    const result = await agent.execute(agentContext);

    expect(result.success).toBe(true);
    expect(runTestMock).toHaveBeenCalledTimes(2);
    expect(result.data?.results).toHaveLength(2);
  });
});
