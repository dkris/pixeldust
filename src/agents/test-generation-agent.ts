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
    let components: string[] = [];

    // Priority 1: Use explicitly included components if specified
    if (config.components?.include && config.components.include.length > 0) {
      this.logger.info('Using explicitly included components');
      components = config.components.include;
    }
    // Priority 2: Auto-detect from application code if available
    else if (config.application?.path) {
      this.logger.info('Auto-detecting components from application code');
      components = await this.scanApplicationForComponents(config.application.path, config.framework.name);

      if (components.length === 0) {
        this.logger.warn('No components detected in application, falling back to default list');
        components = this.getDefaultComponents();
      }
    }
    // Priority 3: Use default component list
    else {
      this.logger.info('Using default component list');
      components = this.getDefaultComponents();
    }

    // Apply exclusions
    if (config.components?.exclude && config.components.exclude.length > 0) {
      this.logger.info(`Excluding components: ${config.components.exclude.join(', ')}`);
      components = components.filter(c => !config.components.exclude.includes(c));
    }

    this.logger.info(`Testing ${components.length} components: ${components.join(', ')}`);
    return components;
  }

  private getDefaultComponents(): string[] {
    // Default UI5 web components for framework-only testing
    return [
      'ui5-button',
      'ui5-input',
      'ui5-card',
      'ui5-table',
      'ui5-list',
      'ui5-dialog',
      'ui5-select',
      'ui5-checkbox',
    ];
  }

  private async scanApplicationForComponents(appPath: string, frameworkName: string): Promise<string[]> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const components = new Set<string>();

    try {
      // Determine component prefix based on framework
      const componentPrefix = this.getComponentPrefix(frameworkName);

      // Patterns to search for based on file type
      const patterns = [
        // HTML/JSX/TSX: <ui5-button>, <ui5-table>
        new RegExp(`<(${componentPrefix}-[a-z0-9-]+)`, 'gi'),
        // JavaScript/TypeScript imports: import "@ui5/webcomponents/dist/Button.js"
        new RegExp(`import.*["']@ui5/webcomponents(?:-[a-z]+)?/dist/([A-Z][a-zA-Z]+)\\.js["']`, 'gi'),
      ];

      // File extensions to scan
      const extensions = ['.html', '.js', '.ts', '.jsx', '.tsx', '.vue', '.svelte'];

      // Recursively scan application directory
      await this.scanDirectory(appPath, extensions, patterns, components, componentPrefix);

      this.logger.info(`Detected ${components.size} unique components in application`);
      return Array.from(components).sort();
    } catch (error) {
      this.logger.error('Failed to scan application for components', error as Error);
      return [];
    }
  }

  private async scanDirectory(
    dir: string,
    extensions: string[],
    patterns: RegExp[],
    components: Set<string>,
    prefix: string
  ): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip common directories to ignore
        if (entry.isDirectory()) {
          const skipDirs = ['node_modules', 'dist', 'build', '.git', 'coverage', 'public'];
          if (skipDirs.includes(entry.name)) {
            continue;
          }
          await this.scanDirectory(fullPath, extensions, patterns, components, prefix);
        } else if (entry.isFile()) {
          // Check if file has relevant extension
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            await this.scanFile(fullPath, patterns, components, prefix);
          }
        }
      }
    } catch (error) {
      // Silently skip directories we can't read
      this.logger.debug(`Skipped directory: ${dir}`);
    }
  }

  private async scanFile(
    filePath: string,
    patterns: RegExp[],
    components: Set<string>,
    prefix: string
  ): Promise<void> {
    const fs = await import('fs/promises');

    try {
      const content = await fs.readFile(filePath, 'utf-8');

      for (const pattern of patterns) {
        let match;
        // Reset regex lastIndex
        pattern.lastIndex = 0;

        while ((match = pattern.exec(content)) !== null) {
          if (match[1]) {
            // Convert component name to tag format
            let componentName = match[1];

            // If it's a PascalCase import (e.g., "Button"), convert to tag format
            if (/^[A-Z]/.test(componentName)) {
              componentName = `${prefix}-${componentName.toLowerCase()}`;
            }

            // Normalize to lowercase
            componentName = componentName.toLowerCase();

            // Only add if it matches the framework prefix
            if (componentName.startsWith(prefix)) {
              components.add(componentName);
            }
          }
        }
      }
    } catch (error) {
      // Silently skip files we can't read
      this.logger.debug(`Skipped file: ${filePath}`);
    }
  }

  private getComponentPrefix(frameworkName: string): string {
    // Map framework names to component tag prefixes
    const prefixMap: Record<string, string> = {
      '@ui5/webcomponents': 'ui5',
      'ui5-webcomponents': 'ui5',
      '@fluentui/web-components': 'fluent',
      '@shoelace-style/shoelace': 'sl',
      '@material/web': 'md',
    };

    return prefixMap[frameworkName] || 'ui5';
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
