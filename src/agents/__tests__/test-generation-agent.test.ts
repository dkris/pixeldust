import { TestGenerationAgent } from '../test-generation-agent';
import { AgentType, Config, Session, SessionState } from '../../types';
import { StageContext } from '../../core/pipeline';
import { EventBus } from '../../core/event-bus';
import Anthropic from '@anthropic-ai/sdk';

// Mock Anthropic SDK
jest.mock('@anthropic-ai/sdk');

function createConfig(overrides?: Partial<Config>): Config {
  const base: Config = {
    framework: { name: '@ui5/webcomponents', versions: ['1.0.0'] },
    components: { include: ['ui5-button', 'ui5-input'], exclude: [] },
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
    ai: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
    storage: { type: 'local', path: './data' },
    reporting: { format: ['markdown'], outputPath: './reports' },
    workflowDiscovery: {
      driver: 'local',
      maxDepth: 2,
      maxPages: 5,
    },
  } as Config;

  return { ...base, ...(overrides || {}) };
}

describe('TestGenerationAgent', () => {
  let mockAnthropicCreate: jest.Mock;

  beforeEach(() => {
    // Setup Anthropic mock
    mockAnthropicCreate = jest.fn().mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'generate_tests',
          input: {
            tests: [
              {
                name: 'ui5-button-renders-correctly',
                description: 'Verify button renders with correct attributes',
                category: 'FUNCTIONAL',
                code: `import { test, expect } from '@playwright/test';

test('ui5-button renders correctly', async ({ page }) => {
  await page.goto('/');
  const button = await page.locator('ui5-button');
  await expect(button).toBeVisible();
});`,
              },
              {
                name: 'ui5-button-visual-snapshot',
                description: 'Capture visual snapshot of button',
                category: 'VISUAL',
                code: `import { test, expect } from '@playwright/test';

test('ui5-button visual snapshot', async ({ page }) => {
  await page.goto('/');
  const button = await page.locator('ui5-button');
  await expect(button).toHaveScreenshot('ui5-button.png');
});`,
              },
              {
                name: 'ui5-button-accessibility',
                description: 'Verify button accessibility attributes',
                category: 'ACCESSIBILITY',
                code: `import { test, expect } from '@playwright/test';

test('ui5-button accessibility', async ({ page }) => {
  await page.goto('/');
  const button = await page.locator('ui5-button');
  await expect(button).toHaveAttribute('role', 'button');
});`,
              },
            ],
          },
        },
      ],
    });

    (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(() => ({
      messages: {
        create: mockAnthropicCreate,
      },
    } as any));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('generates tests for configured components', async () => {
    const config = createConfig();
    const session: Session = {
      id: 'session-test-gen',
      state: SessionState.TEST_GENERATION,
      config,
      versions: ['1.0.0'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const baseContext = new StageContext(session, config, new EventBus());
    const agentContext = baseContext.createAgentContext(baseContext.toObject());

    const agent = new TestGenerationAgent();
    const result = await agent.execute(agentContext);

    expect(result.success).toBe(true);
    expect(result.data?.testSuites).toBeDefined();
    expect(result.data?.testSuites.length).toBeGreaterThan(0);

    // Should generate tests for ui5-button and ui5-input
    expect(result.data?.testSuites.length).toBe(2);

    // Verify AI was called for each component
    expect(mockAnthropicCreate).toHaveBeenCalledTimes(2);

    // Verify total test count
    expect(result.data?.totalTests).toBeGreaterThan(0);
  });

  it('uses default components when no components configured', async () => {
    const config = createConfig({ components: {} });
    const session: Session = {
      id: 'session-test-gen-defaults',
      state: SessionState.TEST_GENERATION,
      config,
      versions: ['1.0.0'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const baseContext = new StageContext(session, config, new EventBus());
    const agentContext = baseContext.createAgentContext(baseContext.toObject());

    const agent = new TestGenerationAgent();
    const result = await agent.execute(agentContext);

    expect(result.success).toBe(true);
    expect(result.data?.testSuites).toBeDefined();
    expect(result.data?.testSuites.length).toBeGreaterThan(0);

    // Should use default UI5 components
    // Default components: ui5-button, ui5-input, ui5-card, ui5-table, ui5-list, ui5-dialog, ui5-select, ui5-checkbox
    expect(result.data?.testSuites.length).toBe(8);
  });

  it('generates different test categories', async () => {
    const config = createConfig();
    const session: Session = {
      id: 'session-test-categories',
      state: SessionState.TEST_GENERATION,
      config,
      versions: ['1.0.0'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const baseContext = new StageContext(session, config, new EventBus());
    const agentContext = baseContext.createAgentContext(baseContext.toObject());

    const agent = new TestGenerationAgent();
    const result = await agent.execute(agentContext);

    expect(result.success).toBe(true);

    const allTests = result.data?.testSuites.flatMap((suite: any) => suite.tests) || [];
    const categories = new Set(allTests.map((test: any) => test.category));

    // Should have multiple test categories
    expect(categories.size).toBeGreaterThan(1);

    // Should include at least FUNCTIONAL and VISUAL
    expect(allTests.some((test: any) => test.category === 'FUNCTIONAL')).toBe(true);
    expect(allTests.some((test: any) => test.category === 'VISUAL')).toBe(true);
  });

  it('handles workflow data from previous stage', async () => {
    const config = createConfig();
    const session: Session = {
      id: 'session-workflow-context',
      state: SessionState.TEST_GENERATION,
      config,
      versions: ['1.0.0'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const baseContext = new StageContext(session, config, new EventBus());

    // Add workflow data to context
    const workflowData = {
      pages: [
        {
          url: 'http://localhost:3000',
          title: 'Test Page',
          components: [{ tag: 'ui5-button', count: 5 }],
        },
      ],
      workflows: [
        {
          name: 'Submit Form',
          steps: ['Click button'],
          components: ['ui5-button'],
          priority: 'high',
        },
      ],
      componentUsage: [
        {
          tag: 'ui5-button',
          totalInstances: 5,
          pageCount: 1,
          patterns: ['Submit', 'Cancel'],
        },
      ],
      discoveredAt: new Date(),
      applicationUrl: 'http://localhost:3000',
      driver: 'local',
    };

    // Store workflow data in layers
    baseContext.layers.set('shared', 'workflow.pages', workflowData.pages);
    baseContext.layers.set('shared', 'workflow.workflows', workflowData.workflows);
    baseContext.layers.set('shared', 'workflow.componentUsage', workflowData.componentUsage);

    const agentContext = baseContext.createAgentContext(baseContext.toObject());

    const agent = new TestGenerationAgent();
    const result = await agent.execute(agentContext);

    expect(result.success).toBe(true);
    expect(result.data?.testSuites).toBeDefined();

    // Should generate tests for ui5-button from workflow data
    expect(result.data?.testSuites.length).toBeGreaterThan(0);
    expect(result.data?.testSuites.some((suite: any) => suite.component === 'ui5-button')).toBe(true);
  });

  it('fails gracefully when AI returns empty tests', async () => {
    // Mock AI to return empty tests
    mockAnthropicCreate.mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'generate_tests',
          input: {
            tests: [],
          },
        },
      ],
    });

    const config = createConfig();
    const session: Session = {
      id: 'session-empty-tests',
      state: SessionState.TEST_GENERATION,
      config,
      versions: ['1.0.0'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const baseContext = new StageContext(session, config, new EventBus());
    const agentContext = baseContext.createAgentContext(baseContext.toObject());

    const agent = new TestGenerationAgent();
    const result = await agent.execute(agentContext);

    // Should still succeed but use fallback tests
    expect(result.success).toBe(true);
    expect(result.data?.testSuites).toBeDefined();

    // Each component should have fallback tests
    result.data?.testSuites.forEach((suite: any) => {
      expect(suite.tests.length).toBeGreaterThan(0);
    });
  });

  it('handles AI errors with fallback tests', async () => {
    // Mock AI to throw error
    mockAnthropicCreate.mockRejectedValue(new Error('AI service unavailable'));

    const config = createConfig();
    const session: Session = {
      id: 'session-ai-error',
      state: SessionState.TEST_GENERATION,
      config,
      versions: ['1.0.0'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const baseContext = new StageContext(session, config, new EventBus());
    const agentContext = baseContext.createAgentContext(baseContext.toObject());

    const agent = new TestGenerationAgent();
    const result = await agent.execute(agentContext);

    // Should succeed with fallback tests
    expect(result.success).toBe(true);
    expect(result.data?.testSuites).toBeDefined();
    expect(result.data?.testSuites.length).toBeGreaterThan(0);

    // Each suite should have at least fallback tests
    result.data?.testSuites.forEach((suite: any) => {
      expect(suite.tests.length).toBeGreaterThan(0);
    });
  });

  it('handles framework-only mode with empty workflow data correctly', async () => {
    // This test reproduces the real-world scenario where workflow discovery
    // returns empty arrays in framework-only mode
    const config = createConfig({
      components: {}, // Empty components config (default from init)
      application: undefined, // No application configured (framework-only)
    });

    const session: Session = {
      id: 'session-framework-only',
      state: SessionState.TEST_GENERATION,
      config,
      versions: ['1.0.0'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const baseContext = new StageContext(session, config, new EventBus());

    // Simulate workflow discovery returning empty data (framework-only mode)
    const workflowData = {
      mode: 'framework-only',
      workflows: [],
      pages: [],
      // Note: no componentUsage field!
    };

    // Add workflow data to context (simulating pipeline flow)
    const stageContext = baseContext.with(AgentType.WORKFLOW_DISCOVERY, workflowData);
    const agentContext = stageContext.createAgentContext(stageContext.toObject());

    const agent = new TestGenerationAgent();
    const result = await agent.execute(agentContext);

    // CRITICAL: Should still succeed and generate default tests
    expect(result.success).toBe(true);
    expect(result.data?.testSuites).toBeDefined();
    expect(result.data?.testSuites.length).toBeGreaterThan(0);

    // Should use default UI5 components
    expect(result.data?.testSuites.length).toBe(8);

    // Each suite should have tests
    result.data?.testSuites.forEach((suite: any) => {
      expect(suite.tests.length).toBeGreaterThan(0);
    });
  });
});
