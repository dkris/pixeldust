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

      // Filter out empty or invalid component names
      const validComponents = components.filter(c => c && c.trim().length > 0);

      if (validComponents.length === 0) {
        throw new Error('No valid components found to test');
      }

      this.logger.info(`Found ${validComponents.length} valid components to test`);

      for (const component of validComponents) {
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
      this.logger.debug(`Included components: ${JSON.stringify(components)}`);
    }
    // Priority 2: Auto-detect from application code if available
    else if (config.application?.path) {
      this.logger.info(`Auto-detecting components from application code: ${config.application.path}`);
      components = await this.scanApplicationForComponents(config.application.path, config.framework.name);
      this.logger.debug(`Scanned components: ${JSON.stringify(components)}`);

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
      const beforeExclude = components.length;
      components = components.filter(c => !config.components.exclude.includes(c));
      this.logger.debug(`Excluded ${beforeExclude - components.length} components`);
    }

    // Filter out any empty or invalid entries
    components = components.filter(c => c && typeof c === 'string' && c.trim().length > 0);

    this.logger.info(`Testing ${components.length} components: ${components.join(', ')}`);

    if (components.length === 0) {
      this.logger.error('No components to test after filtering');
    }

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

IMPORTANT: Return ONLY a valid JSON array. Escape all special characters in the code strings. Use \\n for newlines, \\" for quotes.

Return the tests as a JSON array with this exact structure:
[
  {
    "name": "test name",
    "description": "what this test does",
    "category": "FUNCTIONAL",
    "code": "import { test, expect } from '@playwright/test';\\n\\ntest('test name', async ({ page }) => {\\n  await page.goto('/');\\n  const element = await page.locator('${component}');\\n  await expect(element).toBeVisible();\\n});"
  }
]

Focus on creating robust, maintainable tests that can detect breaking changes between versions.

Return ONLY the JSON array, no explanation or markdown.`;

    try {
      const response = await this.ai.messages.create({
        model: config.ai.model,
        max_tokens: config.ai.maxTokens || 8192,
        temperature: 0.3, // Lower temperature for more consistent JSON
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

      // Try to extract JSON from response
      let jsonText = content.text.trim();

      // Remove markdown code blocks if present
      if (jsonText.startsWith('```')) {
        const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (codeBlockMatch) {
          jsonText = codeBlockMatch[1].trim();
        }
      }

      // Try to find JSON array in the text
      const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        this.logger.warn(`Could not extract JSON array from AI response for ${component}`);
        this.logger.debug(`AI response (first 1000 chars): ${jsonText.substring(0, 1000)}`);
        throw new Error('Could not extract JSON from AI response');
      }

      let testsData;
      try {
        testsData = JSON.parse(jsonMatch[0]);
      } catch (parseError: any) {
        this.logger.error(`JSON parse error for ${component}: ${parseError.message}`);
        this.logger.debug(`Attempted to parse: ${jsonMatch[0].substring(0, 500)}...`);
        throw new Error(`Failed to parse JSON: ${parseError.message}`);
      }

      if (!Array.isArray(testsData)) {
        throw new Error('AI response is not a JSON array');
      }

      const tests = testsData.map((t: any) => ({
        id: uuidv4(),
        name: t.name || `${component} test`,
        description: t.description || 'Test description',
        code: t.code || this.getDefaultTestCode(component),
        category: (t.category as TestCategory) || TestCategory.FUNCTIONAL,
      }));

      this.logger.info(`Successfully generated ${tests.length} tests for ${component}`);
      return tests;

    } catch (error) {
      this.logger.error(`Failed to generate tests for ${component}`, error as Error);
      this.logger.info(`Using fallback tests for ${component}`);

      // Fallback: return basic tests
      return this.getDefaultTests(component);
    }
  }

  private getDefaultTestCode(component: string): string {
    return `import { test, expect } from '@playwright/test';

test('${component} renders correctly', async ({ page }) => {
  await page.goto('/');
  const element = await page.locator('${component}');
  await expect(element).toBeVisible();
});`;
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
