import { BaseAgent } from './base-agent';
import { AgentType, AgentContext, AgentResult, TestSuite, Test, TestCategory } from '../types';
import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';

/**
 * Test Generation Agent - AI-powered test generation
 *
 * Responsibilities:
 * - Analyze component structure
 * - Generate comprehensive test scenarios
 * - Create Playwright tests
 * - Visual regression tests
 * - Accessibility tests
 */
export class TestGenerationAgent extends BaseAgent {
  private ai: Anthropic;

  constructor() {
    super(AgentType.TEST_GENERATION);
    this.ai = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const { config, session } = context;

    try {
      this.logger.info('Generating test suites');

      const testSuites: TestSuite[] = [];

      // Get list of components to test
      const components = await this.discoverComponents(config);

      for (const component of components) {
        this.logger.info(`Generating tests for component: ${component}`);

        const tests = await this.generateTestsForComponent(component, config);

        const testSuite: TestSuite = {
          id: uuidv4(),
          sessionId: session.id,
          version: 'all', // Tests are version-agnostic
          component,
          tests,
          generatedAt: new Date(),
        };

        testSuites.push(testSuite);
      }

      this.logger.info(`Generated ${testSuites.length} test suites`);

      return this.success({
        testSuites,
        totalTests: testSuites.reduce((sum, suite) => sum + suite.tests.length, 0),
      });
    } catch (error) {
      return this.failure(error as Error);
    }
  }

  private async discoverComponents(config: any): Promise<string[]> {
    // For UI5 web components, we can use a predefined list or discovery
    const ui5Components = [
      'ui5-button',
      'ui5-input',
      'ui5-card',
      'ui5-table',
      'ui5-list',
      'ui5-dialog',
      'ui5-select',
      'ui5-checkbox',
    ];

    let components = ui5Components;

    if (config.components.include && config.components.include.length > 0) {
      components = components.filter(c => config.components.include.includes(c));
    }

    if (config.components.exclude && config.components.exclude.length > 0) {
      components = components.filter(c => !config.components.exclude.includes(c));
    }

    return components;
  }

  private async generateTestsForComponent(component: string, config: any): Promise<Test[]> {
    const prompt = `You are an expert in UI testing and Playwright. Generate comprehensive test scenarios for the "${component}" web component.

Generate tests in the following categories:
1. Functional tests (user interactions, state changes)
2. Visual tests (screenshot capture at different states)
3. Accessibility tests (ARIA attributes, keyboard navigation)
4. Performance tests (rendering metrics)

For each test, provide:
- A unique name
- Description
- Playwright test code

The component will be tested across multiple versions, so focus on core functionality that should remain consistent.

Return the tests as a JSON array with this structure:
[
  {
    "name": "test name",
    "description": "what this test does",
    "category": "FUNCTIONAL|VISUAL|ACCESSIBILITY|PERFORMANCE",
    "code": "playwright test code as string"
  }
]

Focus on creating robust, maintainable tests that can detect breaking changes between versions.`;

    try {
      const response = await this.ai.messages.create({
        model: config.ai.model,
        max_tokens: config.ai.maxTokens || 4096,
        temperature: config.ai.temperature || 0.7,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from AI');
      }

      // Parse JSON from response
      const jsonMatch = content.text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('Could not extract JSON from AI response');
      }

      const testsData = JSON.parse(jsonMatch[0]);

      return testsData.map((t: any) => ({
        id: uuidv4(),
        name: t.name,
        description: t.description,
        code: t.code,
        category: t.category as TestCategory,
      }));
    } catch (error) {
      this.logger.error(`Failed to generate tests for ${component}`, error as Error);

      // Fallback: return basic tests
      return this.getDefaultTests(component);
    }
  }

  private getDefaultTests(component: string): Test[] {
    return [
      {
        id: uuidv4(),
        name: `${component} renders correctly`,
        description: 'Basic rendering test',
        category: TestCategory.FUNCTIONAL,
        code: `
import { test, expect } from '@playwright/test';

test('${component} renders correctly', async ({ page }) => {
  await page.goto('/');
  const element = await page.locator('${component}');
  await expect(element).toBeVisible();
});
`,
      },
      {
        id: uuidv4(),
        name: `${component} visual snapshot`,
        description: 'Capture visual snapshot',
        category: TestCategory.VISUAL,
        code: `
import { test, expect } from '@playwright/test';

test('${component} visual snapshot', async ({ page }) => {
  await page.goto('/');
  const element = await page.locator('${component}');
  await expect(element).toHaveScreenshot('${component}.png');
});
`,
      },
    ];
  }
}

export default TestGenerationAgent;
