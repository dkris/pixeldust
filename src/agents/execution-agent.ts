import { BaseAgent } from './base-agent';
import { AgentType, AgentContext, AgentResult, TestResult, Screenshot } from '../types';
import { chromium, firefox, webkit, Browser, Page } from 'playwright';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';

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
  constructor() {
    super(AgentType.EXECUTION);
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const { config, session, data } = context;
    const testSuites = data?.testSuites || [];

    try {
      this.logger.info(`Executing tests across ${session.versions.length} versions`);

      const allResults: TestResult[] = [];

      // Execute tests for each version
      for (const version of session.versions) {
        this.logger.info(`Running tests for version ${version}`);

        const versionResults = await this.runTestsForVersion(
          version,
          testSuites,
          config,
          session.id,
          data?.containers || []
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
      throw new Error(`No container found for version ${version}`);
    }

    const baseUrl = `http://localhost:${container.port}`;

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
}

export default ExecutionAgent;
