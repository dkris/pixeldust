import { BaseAgent } from './base-agent';
import { AgentType, AgentContext, AgentResult, TestSuite, Test, TestCategory } from '../types';
import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import {
  getComponentPrefix,
  getImportPatterns,
  getComponentPatterns,
  isReactFramework,
  detectFrameworkType
} from '../utils/framework-detector';

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
    const { config, session, data } = context;

    try {
      this.logger.info('Generating test suites');

      const testSuites: TestSuite[] = [];

      // Check if workflow data is available
      const workflowData = data?.pages && data?.workflows ? data : null;
      if (workflowData) {
        this.logger.info(`Using workflow data: ${workflowData.pages.length} pages, ${workflowData.workflows.length} workflows`);
      }

      // Get list of components to test
      const components = await this.discoverComponents(config, workflowData);

      // Filter out empty or invalid component names
      const validComponents = components.filter(c => c && c.trim().length > 0);

      if (validComponents.length === 0) {
        throw new Error('No valid components found to test');
      }

      this.logger.info(`Found ${validComponents.length} valid components to test`);

      for (const component of validComponents) {
        this.logger.info(`Generating tests for component: ${component}`);

        const tests = await this.generateTestsForComponent(component, config, workflowData);

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

  private async discoverComponents(config: any, workflowData: any = null): Promise<string[]> {
    let components: string[] = [];

    // Priority 1: Use components from workflow discovery if available
    if (workflowData?.componentUsage && workflowData.componentUsage.length > 0) {
      this.logger.info(`Using components discovered from workflow analysis`);
      components = workflowData.componentUsage.map((usage: any) => usage.tag);
      this.logger.info(`Discovered ${components.length} components from workflows: ${components.join(', ')}`);
    }
    // Priority 2: Auto-detect from application code if available
    else if (config.application?.path) {
      this.logger.info(`Auto-detecting components from application source: ${config.application.path}`);
      components = await this.scanApplicationForComponents(config.application.path, config.framework.name);
      this.logger.info(`Discovered ${components.length} components from source files: ${components.join(', ')}`);

      // Merge with explicitly included components if specified
      if (config.components?.include && config.components.include.length > 0) {
        const explicitComponents = config.components.include;
        const merged = new Set([...components, ...explicitComponents]);
        components = Array.from(merged);
        this.logger.info(`Merged with ${explicitComponents.length} explicitly included components`);
      }

      // If no components found, fall back to defaults
      if (components.length === 0) {
        this.logger.warn('No components detected in application, falling back to default list');
        components = this.getDefaultComponents();
      }
    }
    // Priority 3: Use explicitly included components if specified (framework-only mode)
    else if (config.components?.include && config.components.include.length > 0) {
      this.logger.info('Using explicitly included components (framework-only mode)');
      components = config.components.include;
      this.logger.debug(`Included components: ${JSON.stringify(components)}`);
    }
    // Priority 4: Use default component list
    else {
      this.logger.info('Using default component list (framework-only mode)');
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
      // Get framework-specific patterns from detector
      const importPatterns = getImportPatterns(frameworkName);
      const componentPatterns = getComponentPatterns(frameworkName);
      const componentPrefix = getComponentPrefix(frameworkName);

      // Combine all patterns
      const patterns = [...importPatterns, ...componentPatterns];

      // If no patterns found, use legacy approach for backward compatibility
      if (patterns.length === 0) {
        this.logger.warn(`No patterns found for framework ${frameworkName}, using legacy detection`);
        const legacyPrefix = this.getComponentPrefix(frameworkName);
        patterns.push(new RegExp(`<(${legacyPrefix}-[a-z0-9-]+)(?:\\s|/|>)`, 'gi'));
      }

      // File extensions to scan
      const extensions = ['.html', '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs', '.vue', '.svelte'];

      // Recursively scan application directory
      await this.scanDirectory(appPath, extensions, patterns, components, componentPrefix || 'ui5');

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
          const skipDirs = [
            'node_modules', 'dist', 'build', '.git', 'coverage', 'public',
            '.next', '.nuxt', '.cache', 'out', 'target', 'vendor',
            '__pycache__', '.venv', 'venv', '.tox', '.pytest_cache'
          ];
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

            // For React components (PascalCase), keep the format as-is
            // React component names are in PascalCase (Button, Input, etc.)
            if (/^[A-Z]/.test(componentName) && !prefix) {
              // React component - keep PascalCase
              components.add(componentName);
            }
            // For web components with prefix
            else if (prefix && componentName.startsWith(prefix)) {
              // Normalize to lowercase for web components
              components.add(componentName.toLowerCase());
            }
            // If it's a PascalCase import for a prefixed framework (e.g., UI5)
            else if (prefix && /^[A-Z]/.test(componentName)) {
              componentName = `${prefix}-${componentName.toLowerCase()}`;
              components.add(componentName);
            }
            // Already in proper format
            else if (componentName.includes('-')) {
              components.add(componentName.toLowerCase());
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
    // Use framework detector if available, fallback to legacy map
    const detectedPrefix = getComponentPrefix(frameworkName);
    if (detectedPrefix) {
      return detectedPrefix;
    }

    // Legacy map for backward compatibility
    const prefixMap: Record<string, string> = {
      '@ui5/webcomponents': 'ui5',
      'ui5-webcomponents': 'ui5',
      '@ui5/webcomponents-react': 'ui5',
      '@fluentui/web-components': 'fluent',
      '@shoelace-style/shoelace': 'sl',
      '@material/web': 'md',
      'react': '', // React components don't have a prefix
    };

    return prefixMap[frameworkName] || 'ui5';
  }

  private async generateTestsForComponent(component: string, config: any, workflowData: any = null): Promise<Test[]> {
    // Determine if we're in application mode or framework-only mode
    const isApplicationMode = !!config.application;

    let prompt: string;

    if (isApplicationMode) {
      // Build workflow context if available
      let workflowContext = '';
      if (workflowData) {
        const componentUsage = workflowData.componentUsage?.find((u: any) => u.tag === component);
        const relevantWorkflows = workflowData.workflows?.filter((w: any) =>
          w.components.includes(component)
        ) || [];
        const relevantPages = workflowData.pages?.filter((p: any) =>
          p.components.some((c: any) => c.tag === component)
        ) || [];

        if (componentUsage || relevantWorkflows.length > 0 || relevantPages.length > 0) {
          workflowContext = `\n\nWORKFLOW CONTEXT (discovered from application):`;

          if (componentUsage) {
            workflowContext += `\n- ${component} is used on ${componentUsage.pageCount} page(s): ${componentUsage.pages.join(', ')}`;
            workflowContext += `\n- Total instances: ${componentUsage.totalInstances}`;
            if (componentUsage.patterns.length > 0) {
              workflowContext += `\n- Common patterns: ${componentUsage.patterns.join(', ')}`;
            }
          }

          if (relevantPages.length > 0) {
            workflowContext += `\n\nPages containing ${component}:`;
            relevantPages.slice(0, 3).forEach((page: any) => {
              const comp = page.components.find((c: any) => c.tag === component);
              workflowContext += `\n- "${page.title}" (${page.url}): ${comp.count} instance(s)`;
            });
          }

          if (relevantWorkflows.length > 0) {
            workflowContext += `\n\nRelevant Workflows:`;
            relevantWorkflows.slice(0, 2).forEach((workflow: any) => {
              workflowContext += `\n- "${workflow.name}" (Priority: ${workflow.priority})`;
              workflow.steps.slice(0, 3).forEach((step: any) => {
                if (step.action) {
                  workflowContext += `\n  ${step.order}. ${step.action.description}`;
                }
              });
            });
          }
        }
      }

      // Application-aware test generation with workflow context
      prompt = `Generate comprehensive test scenarios for the "${component}" web component IN THE CONTEXT of a real application.

IMPORTANT: These tests will run against the actual application at ${config.application.path}, NOT standalone components.${workflowContext}

Generate tests in the following categories with balanced distribution:
1. Functional tests (40%) - Test how ${component} works within the application's features
   - Navigate to pages where ${component} is used
   - Test interactions in the context of real workflows
   - Verify component behavior affects application state correctly

2. Visual tests (25%) - Verify ${component} renders correctly in the application
   - Test in real page layouts, not isolation
   - Verify styling matches application theme
   - Check responsiveness within actual pages

3. Accessibility tests (20%) - Test a11y in application context
   - ARIA attributes work with application flow
   - Keyboard navigation works in real scenarios
   - Screen reader support in actual user journeys

4. Performance tests (15%) - Measure performance in application
   - Page load time with ${component}
   - Interaction responsiveness in real workflows
   - Resource usage in application context

For each test, provide:
- A unique descriptive name (kebab-case) that reflects the application context
- Clear description of what application functionality is being tested
- Category that matches one of the four above
- Complete Playwright test code that navigates to the actual pages where the component is used

Example test names:
- "${component}-login-form-submission" (not just "button-click")
- "${component}-dashboard-data-display" (not just "table-renders")

Generate 6-8 tests that verify the component works correctly within the application's real workflows.`;
    } else {
      // Framework-only mode (existing behavior)
      prompt = `Generate comprehensive test scenarios for the "${component}" web component.

Generate tests in the following categories with balanced distribution:
1. Functional tests (40%) - User interactions, state changes, behavior verification
2. Visual tests (25%) - Screenshot capture, rendering verification, layout checks
3. Accessibility tests (20%) - ARIA attributes, keyboard navigation, screen reader support
4. Performance tests (15%) - Rendering speed, interaction responsiveness, resource usage

IMPORTANT: Include at least ONE test from each category to ensure balanced coverage.

For each test, provide:
- A unique descriptive name (kebab-case) that includes the component name
- Clear description of what the test verifies
- Category that matches one of the four above
- Complete Playwright test code

The component will be tested across multiple versions, so focus on core functionality that should remain consistent.

Generate 6-8 comprehensive tests with representation from all categories.`;
    }

    try {
      const response = await this.ai.messages.create({
        model: config.ai.model,
        max_tokens: config.ai.maxTokens || 8192,
        temperature: 0.3, // Lower temperature for more consistent output
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        tools: [
          {
            name: 'generate_tests',
            description: 'Generate Playwright test cases for a UI component',
            input_schema: {
              type: 'object',
              properties: {
                tests: {
                  type: 'array',
                  description: 'Array of test cases',
                  items: {
                    type: 'object',
                    properties: {
                      name: {
                        type: 'string',
                        description: 'Test name in kebab-case (e.g., button-renders-with-text)',
                      },
                      description: {
                        type: 'string',
                        description: 'What this test verifies',
                      },
                      category: {
                        type: 'string',
                        enum: ['FUNCTIONAL', 'VISUAL', 'ACCESSIBILITY', 'PERFORMANCE'],
                        description: 'Test category',
                      },
                      code: {
                        type: 'string',
                        description: 'Complete Playwright test code',
                      },
                    },
                    required: ['name', 'description', 'category', 'code'],
                  },
                },
              },
              required: ['tests'],
            },
          },
        ],
        tool_choice: { type: 'tool', name: 'generate_tests' },
      });

      // Find the tool use block in the response
      const toolUseBlock = response.content.find(block => block.type === 'tool_use');

      if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
        this.logger.warn(`No tool_use block found in AI response for ${component}`);
        this.logger.debug(`Response content: ${JSON.stringify(response.content, null, 2)}`);
        throw new Error('AI did not use the generate_tests tool');
      }

      // Log the tool input for debugging
      this.logger.debug(`Tool input for ${component}: ${JSON.stringify(toolUseBlock.input, null, 2)}`);

      const testsData = toolUseBlock.input as any;

      // Handle various response formats
      let testsArray: any[] = [];

      if (testsData.tests && Array.isArray(testsData.tests)) {
        // Standard format: { tests: [...] }
        testsArray = testsData.tests;
      } else if (Array.isArray(testsData)) {
        // Direct array format: [...]
        testsArray = testsData;
      } else if (testsData.test_cases && Array.isArray(testsData.test_cases)) {
        // Alternative format: { test_cases: [...] }
        testsArray = testsData.test_cases;
      } else {
        // Try to find any array property
        const arrayProp = Object.keys(testsData).find(key => Array.isArray(testsData[key]));
        if (arrayProp) {
          this.logger.warn(`Using alternative array property: ${arrayProp}`);
          testsArray = testsData[arrayProp];
        } else {
          this.logger.error(`Invalid tool input structure for ${component}`);
          this.logger.error(`Tool input: ${JSON.stringify(testsData, null, 2)}`);
          throw new Error('Tool input does not contain tests array');
        }
      }

      if (testsArray.length === 0) {
        this.logger.warn(`AI returned empty tests array for ${component}`);
        throw new Error('AI returned empty tests array');
      }

      const tests = testsArray.map((t: any, index: number) => {
        // Validate and provide defaults for each test
        const testName = t.name || t.test_name || `${component}-test-${index + 1}`;
        const description = t.description || t.desc || `Test ${index + 1} for ${component}`;
        const category = (t.category || t.test_category || 'FUNCTIONAL') as TestCategory;
        const code = t.code || t.test_code || this.getDefaultTestCode(component);

        return {
          id: uuidv4(),
          name: testName,
          description,
          code,
          category,
        };
      });

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
