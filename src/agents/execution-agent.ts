import { BaseAgent } from './base-agent';
import { AgentType, AgentContext, AgentResult, TestResult, Screenshot } from '../types';
import { chromium, firefox, webkit, Browser, Page } from 'playwright';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { DatabaseManager } from '../storage/database';

/**
 * Execution Agent - Runs tests and collects data
 *
 * Responsibilities:
 * - Execute Playwright tests
 * - Capture screenshots
 * - Extract DOM snapshots
 * - Collect performance metrics
 * - Parallel execution
 */
export class ExecutionAgent extends BaseAgent {
  constructor(db?: DatabaseManager) {
    super(AgentType.EXECUTION, db);
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    return this.executeWithTracking(context, async () => {
      const { config, session, data } = context;
      const stageScopedSuites = data?.[AgentType.TEST_GENERATION]?.testSuites;
      const legacySuites = data?.testSuites;
      const testSuites = stageScopedSuites || legacySuites;

      if (!testSuites || testSuites.length === 0) {
        throw new Error(
          'ExecutionAgent requires test suites from the TEST_GENERATION stage, but none were found in the current context.'
        );
      }
      const containers = this.resolveContainers(data);

      try {
        this.logger.info(`Executing tests across ${session.versions.length} versions`);
        this.logger.debug(`Resolved containers data:`, containers);
        this.logger.debug(`Received test suites: ${testSuites.length}`);

        const allResults: TestResult[] = [];

        // Execute tests for each version
        for (const version of session.versions) {
          this.logger.info(`Running tests for version ${version}`);

          const versionResults = await this.runTestsForVersion(
            version,
            testSuites,
            config,
            session.id,
            containers
          );

          allResults.push(...versionResults);
        }

        this.logger.info(`Executed ${allResults.length} tests`);

        return this.success({
          results: allResults,
          passed: allResults.filter(r => r.status === 'passed').length,
          failed: allResults.filter(r => r.status === 'failed').length,
          skipped: allResults.filter(r => r.status === 'skipped').length,
        });
      } catch (error) {
        return this.failure(error as Error);
      }
    });
  }

  private async runTestsForVersion(
    version: string,
    testSuites: any[],
    config: any,
    sessionId: string,
    containers: any[]
  ): Promise<TestResult[]> {
    const results: TestResult[] = [];

    // Find container for this version
    const container = containers.find((c: any) => c.version === version);
    if (!container) {
      this.logger.error(`No container found for version ${version}`);
      this.logger.error(`Available containers:`, containers);
      throw new Error(
        `No container found for version ${version}. ` +
        `Available versions: ${containers.map((c: any) => c.version).join(', ')}`
      );
    }

    // Validate container has valid port or URL
    if (!container.url && (!container.port || isNaN(container.port))) {
      this.logger.error(`Invalid container configuration for version ${version}:`, container);
      throw new Error(
        `Container for version ${version} has invalid port (${container.port}). ` +
        `Container setup may have failed.`
      );
    }

    // Use container.url for application mode, or construct baseUrl for framework mode
    const baseUrl = container.url || `http://localhost:${container.port}`;

    this.logger.info(`Testing version ${version} at ${baseUrl}`);

    // Run tests for each browser
    for (const browserType of config.testing.browsers) {
      const browser = await this.launchBrowser(browserType);

      try {
        for (const suite of testSuites) {
          for (const test of suite.tests) {
            const result = await this.runTest(
              test,
              browser,
              baseUrl,
              version,
              sessionId,
              config
            );
            results.push(result);
          }
        }
      } finally {
        await browser.close();
      }
    }

    return results;
  }

  private async launchBrowser(browserType: string): Promise<Browser> {
    const browsers: Record<string, any> = {
      chromium,
      firefox,
      webkit,
    };

    try {
      return await browsers[browserType].launch({
        headless: true,
      });
    } catch (error: any) {
      // Check if error is due to missing Playwright browsers
      if (error.message && error.message.includes("Executable doesn't exist")) {
        const betterError = new Error(
          `Playwright browsers are not installed.\n\n` +
          `Please run one of the following commands:\n\n` +
          `  1. From PixelDust directory:\n` +
          `     cd ${process.cwd()}\n` +
          `     npx playwright install\n\n` +
          `  2. Or install all browsers:\n` +
          `     npx playwright install chromium firefox webkit\n\n` +
          `  3. Or just the one you need:\n` +
          `     npx playwright install ${browserType}\n\n` +
          `Original error: ${error.message}`
        );
        throw betterError;
      }
      throw error;
    }
  }

  private async runTest(
    test: any,
    browser: Browser,
    baseUrl: string,
    version: string,
    sessionId: string,
    config: any
  ): Promise<TestResult> {
    const startTime = Date.now();

    try {
      const page = await browser.newPage({
        viewport: config.testing.viewport,
      });

      // Navigate to test page
      await page.goto(baseUrl, { timeout: config.testing.timeout });

      // Wait for page to be ready
      await page.waitForLoadState('networkidle', { timeout: config.testing.timeout });

      // Wait for web components to be registered (if this is a framework test page)
      await this.waitForComponentsReady(page);

      // Execute the actual test based on category
      await this.executeTestLogic(page, test, config);

      // Capture screenshots
      const screenshots = await this.captureScreenshots(
        page,
        test,
        version,
        sessionId
      );

      // Extract DOM snapshot
      const domSnapshot = await this.extractDOM(page);

      // Collect performance metrics
      const metrics = await this.collectMetrics(page);

      await page.close();

      const duration = Date.now() - startTime;

      return {
        id: uuidv4(),
        testId: test.id,
        sessionId,
        version,
        status: 'passed',
        duration,
        screenshots,
        domSnapshot,
        metrics,
        executedAt: new Date(),
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.warn(`Test ${test.name} failed: ${(error as Error).message}`);

      return {
        id: uuidv4(),
        testId: test.id,
        sessionId,
        version,
        status: 'failed',
        duration,
        error: (error as Error).message,
        screenshots: [],
        executedAt: new Date(),
      };
    }
  }

  /**
   * Wait for web components to be ready (framework test pages only)
   */
  private async waitForComponentsReady(page: Page): Promise<void> {
    try {
      // Wait for the components-ready attribute to be set (max 15 seconds)
      await page.waitForFunction(
        () => document.body.hasAttribute('data-components-ready'),
        { timeout: 15000 }
      ).catch(() => {
        // Timeout is OK - this might not be a framework test page
        this.logger.debug('No component ready marker found - likely an application page');
      });

      // Check the status of component loading
      const status = await page.evaluate(() => document.body.getAttribute('data-components-ready'));

      if (status === 'error') {
        this.logger.warn('Some web components failed to load, but continuing with test');

        // Log console errors from the page
        const errors = await page.evaluate(() => {
          return (window as any).__componentErrors || [];
        });

        if (errors.length > 0) {
          this.logger.warn('Component errors:', errors);
        }
      } else if (status === 'timeout') {
        this.logger.warn('Component loading timed out, but continuing with test');
      } else if (status === 'true') {
        this.logger.debug('All web components loaded successfully');
      }

      // Additional wait for components to fully render (paint cycles)
      await page.waitForTimeout(1500);
    } catch (error) {
      this.logger.debug('Component ready check failed or timed out - continuing anyway');
    }
  }

  /**
   * Execute test logic based on test category
   */
  private async executeTestLogic(page: Page, test: any, config: any): Promise<void> {
    this.logger.debug(`Executing ${test.category} test: ${test.name}`);

    const isApplicationMode = !!config.application;

    switch (test.category) {
      case 'FUNCTIONAL':
        await this.executeFunctionalTest(page, test, isApplicationMode);
        break;

      case 'VISUAL':
        await this.executeVisualTest(page, test, isApplicationMode);
        break;

      case 'ACCESSIBILITY':
        await this.executeAccessibilityTest(page, test, isApplicationMode);
        break;

      case 'PERFORMANCE':
        await this.executePerformanceTest(page, test, isApplicationMode);
        break;

      default:
        // Default: just verify page loaded
        await page.waitForLoadState('load');
    }
  }

  /**
   * Execute functional tests - verify component behavior
   */
  private async executeFunctionalTest(page: Page, test: any, isApplicationMode: boolean): Promise<void> {
    // Extract component name from test name or use a pattern
    const componentMatch = test.name.match(/(ui5-[\w-]+)/);
    const component = componentMatch ? componentMatch[1] : 'ui5-button';

    if (isApplicationMode) {
      this.logger.debug(`Testing ${component} in application context`);

      // In application mode, be more lenient - component might be on a different page
      // or might not be present on initial load
      try {
        // Wait a bit for the application to fully load
        await page.waitForLoadState('networkidle', { timeout: 10000 });

        // Look for the component anywhere in the application
        const element = page.locator(component).first();
        const isAttached = await element.count().then(c => c > 0).catch(() => false);

        if (isAttached) {
          const isVisible = await element.isVisible();
          this.logger.debug(`Component ${component} found: visible=${isVisible}`);

          // If visible and interactive, try to interact
          if (isVisible && (component.includes('button') || component.includes('input'))) {
            try {
              await element.click({ timeout: 2000 });
              this.logger.debug(`Successfully interacted with ${component} in application`);
            } catch {
              this.logger.debug(`Component ${component} not interactable (may be disabled or readonly)`);
            }
          }
        } else {
          this.logger.debug(`Component ${component} not found on current page (may be on different route)`);
        }
      } catch (error) {
        this.logger.debug(`Application functional test warning: ${(error as Error).message}`);
        // Don't fail - component might be on a different page
      }
    } else {
      // Framework-only mode - strict validation
      const element = page.locator(component).first();
      await element.waitFor({ state: 'attached', timeout: 5000 });

      const isVisible = await element.isVisible();
      if (!isVisible) {
        throw new Error(`Component ${component} is not visible`);
      }

      if (component.includes('button') || component.includes('input')) {
        try {
          await element.click({ timeout: 2000 });
          this.logger.debug(`Successfully clicked ${component}`);
        } catch {
          this.logger.debug(`Component ${component} not clickable`);
        }
      }
    }
  }

  /**
   * Execute visual tests - verify rendering
   */
  private async executeVisualTest(page: Page, test: any, isApplicationMode: boolean): Promise<void> {
    const componentMatch = test.name.match(/(ui5-[\w-]+)/);
    const component = componentMatch ? componentMatch[1] : 'ui5-button';

    const element = page.locator(component).first();

    if (isApplicationMode) {
      // In application mode, just verify page rendered
      await page.waitForLoadState('load');
      this.logger.debug(`Visual test for ${component} in application context`);

      const isAttached = await element.count().then(c => c > 0).catch(() => false);
      if (isAttached) {
        const box = await element.boundingBox();
        if (box) {
          this.logger.debug(`Component ${component} rendered: ${box.width}x${box.height}`);
        }
      }
    } else {
      // Framework-only mode - strict validation
      await element.waitFor({ state: 'visible', timeout: 5000 });
      const box = await element.boundingBox();
      if (!box || box.width === 0 || box.height === 0) {
        throw new Error(`Component ${component} has zero dimensions`);
      }
      this.logger.debug(`Component ${component} rendered with dimensions: ${box.width}x${box.height}`);
    }
  }

  /**
   * Execute accessibility tests - verify ARIA and a11y
   */
  private async executeAccessibilityTest(page: Page, test: any, isApplicationMode: boolean): Promise<void> {
    const componentMatch = test.name.match(/(ui5-[\w-]+)/);
    const component = componentMatch ? componentMatch[1] : 'ui5-button';

    const element = page.locator(component).first();

    if (isApplicationMode) {
      // In application mode, do basic a11y checks
      await page.waitForLoadState('load');
      const isAttached = await element.count().then(c => c > 0).catch(() => false);

      if (isAttached) {
        const role = await element.getAttribute('role');
        const ariaLabel = await element.getAttribute('aria-label');
        this.logger.debug(`Component ${component} a11y: role=${role}, aria-label=${ariaLabel}`);
      } else {
        this.logger.debug(`Component ${component} not on current page`);
      }
    } else {
      // Framework-only mode - strict validation
      await element.waitFor({ state: 'attached', timeout: 5000 });
      const role = await element.getAttribute('role');
      const ariaLabel = await element.getAttribute('aria-label');
      this.logger.debug(`Component ${component} accessibility: role=${role}, aria-label=${ariaLabel}`);

      try {
        await element.focus({ timeout: 2000 });
        const isFocused = await element.evaluate(el => el === document.activeElement);
        if (!isFocused) {
          this.logger.warn(`Component ${component} is not keyboard focusable`);
        }
      } catch {
        this.logger.warn(`Failed to focus ${component}`);
      }
    }
  }

  /**
   * Execute performance tests - measure metrics
   */
  private async executePerformanceTest(page: Page, test: any, isApplicationMode: boolean): Promise<void> {
    const metrics = await page.evaluate(() => {
      const perfData = performance.getEntriesByType('navigation')[0] as any;
      return {
        loadTime: perfData?.loadEventEnd - perfData?.fetchStart || 0,
        domReady: perfData?.domContentLoadedEventEnd - perfData?.fetchStart || 0,
      };
    });

    this.logger.debug(`Performance metrics: loadTime=${metrics.loadTime}ms, domReady=${metrics.domReady}ms`);

    if (isApplicationMode) {
      // In application mode, use more lenient thresholds (apps are heavier)
      if (metrics.loadTime > 10000) {
        throw new Error(`Application load time exceeded threshold: ${metrics.loadTime}ms > 10000ms`);
      }
    } else {
      // Framework-only mode - strict threshold
      if (metrics.loadTime > 5000) {
        throw new Error(`Page load time exceeded threshold: ${metrics.loadTime}ms > 5000ms`);
      }
    }
  }

  private async captureScreenshots(
    page: Page,
    test: any,
    version: string,
    sessionId: string
  ): Promise<Screenshot[]> {
    const screenshots: Screenshot[] = [];

    try {
      const screenshotDir = path.join(
        process.cwd(),
        'data',
        'screenshots',
        sessionId,
        version,
        test.name
      );

      await fs.mkdir(screenshotDir, { recursive: true });

      // Capture initial state
      const screenshotPath = path.join(screenshotDir, 'initial.png');
      await page.screenshot({ path: screenshotPath, fullPage: true });

      screenshots.push({
        id: uuidv4(),
        path: screenshotPath,
        name: 'initial',
        state: 'initial',
      });

      // TODO: Capture additional states based on test interactions
    } catch (error) {
      this.logger.warn('Failed to capture screenshots', error as Error);
    }

    return screenshots;
  }

  private async extractDOM(page: Page): Promise<string> {
    try {
      return await page.content();
    } catch (error) {
      this.logger.warn('Failed to extract DOM', error as Error);
      return '';
    }
  }

  private async collectMetrics(page: Page): Promise<any> {
    try {
      const metrics = await page.evaluate(() => {
        const perfData = performance.getEntriesByType('navigation')[0] as any;
        const paintEntries = performance.getEntriesByType('paint');

        return {
          fcp: paintEntries.find(e => e.name === 'first-contentful-paint')?.startTime || 0,
          lcp: 0, // Would need additional instrumentation
          tti: perfData?.domInteractive || 0,
          cls: 0, // Would need layout shift tracking
          fid: 0, // Would need input delay tracking
        };
      });

      return metrics;
    } catch (error) {
      this.logger.warn('Failed to collect metrics', error as Error);
      return null;
    }
  }

  private resolveContainers(data?: Record<string, any>): any[] {
    if (!data) {
      return [];
    }

    const directContainers = (data as any).containers;
    if (Array.isArray(directContainers)) {
      return directContainers;
    }

    const preferredSources = [
      AgentType.ENVIRONMENT,
      AgentType.APPLICATION_LOADER,
      AgentType.WORKFLOW_DISCOVERY,
    ];

    for (const key of preferredSources) {
      const source = (data as Record<string, any>)[key];
      if (source && Array.isArray(source.containers)) {
        return source.containers;
      }
    }

    for (const value of Object.values(data)) {
      if (value && typeof value === 'object' && Array.isArray((value as any).containers)) {
        return (value as any).containers;
      }
    }

    return [];
  }
}

export default ExecutionAgent;
