import { AnalysisAgent } from '../analysis-agent';
import { StageContext } from '../../core/pipeline';
import { EventBus } from '../../core/event-bus';
import { AgentType, Config, Session, SessionState } from '../../types';

describe('AnalysisAgent', () => {
  const createConfig = (overrides?: Partial<Config>): Config => {
    return {
      framework: { name: 'test-framework', versions: ['1.0.0', '2.0.0'] },
      components: { include: [], exclude: [] },
      containers: {
        runtime: 'docker',
        baseImage: 'node',
        resources: { memory: '1g', cpu: 1 },
      },
      testing: {
        browsers: ['chromium'],
        viewport: { width: 800, height: 600 },
        timeout: 1000,
        retries: 0,
        headless: true,
      },
      analysis: {
        visualThreshold: 0.1,
        domIgnoreAttributes: [],
        performanceThresholds: { fcp: 10, lcp: 10, tti: 10 },
      },
      ai: { provider: 'anthropic', model: 'claude-3' },
      storage: { type: 'local', path: './data' },
      reporting: { format: ['markdown'], outputPath: './reports' },
      application: {
        path: process.cwd(),
        buildCommand: 'npm run build',
        startCommand: 'npm start',
        port: 3000,
      },
      workflowDiscovery: { driver: 'local', maxDepth: 1, maxPages: 1 },
      ...(overrides || {}),
    } as Config;
  };

  const createStageContext = (config: Config): StageContext => {
    const session: Session = {
      id: 'session-123',
      state: SessionState.ANALYSIS,
      config,
      versions: config.framework.versions,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const eventBus = new EventBus();
    return new StageContext(session, config, eventBus);
  };

  it('uses execution results from StageContext payload to produce comparisons', async () => {
    const config = createConfig();
    const baseContext = createStageContext(config);
    const executionPayload = {
      results: [
        {
          version: '1.0.0',
          testId: 'home',
          screenshots: [],
          domSnapshot: '<div id="root">Hello</div>',
          metrics: { fcp: 100, lcp: 150, tti: 200 },
        },
        {
          version: '2.0.0',
          testId: 'home',
          screenshots: [],
          domSnapshot: '<div id="root">Hello</div>',
          metrics: { fcp: 120, lcp: 170, tti: 220 },
        },
      ],
    };

    const contextWithExecution = baseContext.with(AgentType.EXECUTION, executionPayload);
    const agentContext = contextWithExecution.createAgentContext(
      contextWithExecution.toObject()
    );

    const agent = new AnalysisAgent();
    const result = await agent.execute(agentContext);

    expect(result.success).toBe(true);
    expect(result.data?.comparisons).toHaveLength(1);
  });

  it('fails with a helpful error when execution results are missing', async () => {
    const config = createConfig();
    const stageContext = createStageContext(config);
    const agentContext = stageContext.createAgentContext(stageContext.toObject());

    const agent = new AnalysisAgent();
    const result = await agent.execute(agentContext);

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('execution-stage results');
  });
});
