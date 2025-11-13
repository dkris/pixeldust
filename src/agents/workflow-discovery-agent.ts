import { BaseAgent } from './base-agent';
import {
  AgentType,
  AgentContext,
  AgentResult,
  Page,
  PageComponent,
  InteractiveElement,
  Workflow,
  WorkflowStep,
  WorkflowDiscoveryResult,
  ComponentUsageSummary,
} from '../types';
import { chromium, Browser, Page as PlaywrightPage } from 'playwright';
import { URL } from 'url';
import { v4 as uuidv4 } from 'uuid';

/**
 * Workflow Discovery Agent - Crawls application to discover pages and workflows
 *
 * Responsibilities:
 * - Crawl running application to discover all pages/routes
 * - Map components to pages
 * - Identify interactive elements and potential workflows
 * - Build workflow graphs based on navigation patterns
 * - Provide workflow data for intelligent test generation
 */
export class WorkflowDiscoveryAgent extends BaseAgent {
  private browser: Browser | null = null;
  private visitedUrls: Set<string> = new Set();
  private discoveredPages: Page[] = [];
  private maxDepth: number = 3;
  private maxPages: number = 50;
  private frameworkPrefix: string = 'ui5';

  constructor() {
    super(AgentType.WORKFLOW_DISCOVERY);
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const { config, data } = context;

    // Only run workflow discovery in application mode
    if (!config.application) {
      this.logger.info('Skipping workflow discovery (framework-only mode)');
      return this.success({ mode: 'framework-only', workflows: [], pages: [] });
    }

    try {
      this.logger.info('Starting workflow discovery');

      // Get application URL from containers or application config
      const applicationUrl = this.getApplicationUrl(data, config);
      if (!applicationUrl) {
        throw new Error('No application URL available for workflow discovery');
      }

      this.logger.info(`Crawling application: ${applicationUrl}`);

      // Determine framework prefix for component detection
      this.frameworkPrefix = this.getFrameworkPrefix(config.framework.name);

      // Launch browser
      this.browser = await chromium.launch({
        headless: config.testing.headless !== false,
      });

      // Crawl application starting from root
      await this.crawlApplication(applicationUrl, 0);

      // Build workflows from discovered pages
      const workflows = await this.buildWorkflows();

      // Generate component usage summary
      const componentUsage = this.analyzeComponentUsage();

      const result: WorkflowDiscoveryResult = {
        pages: this.discoveredPages,
        workflows,
        componentUsage,
        discoveredAt: new Date(),
        applicationUrl,
      };

      this.logger.info(`Workflow discovery complete:`);
      this.logger.info(`  - ${result.pages.length} pages discovered`);
      this.logger.info(`  - ${result.workflows.length} workflows identified`);
      this.logger.info(`  - ${result.componentUsage.length} unique components`);

      return this.success(result);
    } catch (error) {
      this.logger.error('Workflow discovery failed', error as Error);
      return this.failure(error as Error);
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }
  }

  /**
   * Get application URL from containers or config
   */
  private getApplicationUrl(data: any, config: any): string | null {
    // Priority 1: Use container URL if available
    if (data?.containers && data.containers.length > 0) {
      const container = data.containers[0];
      if (container.url) {
        return container.url;
      }
    }

    // Priority 2: Construct from config
    if (config.application?.port) {
      return `http://localhost:${config.application.port}`;
    }

    return null;
  }

  /**
   * Crawl application recursively
   */
  private async crawlApplication(url: string, depth: number): Promise<void> {
    // Stop if max depth or max pages reached
    if (depth > this.maxDepth || this.discoveredPages.length >= this.maxPages) {
      return;
    }

    // Normalize URL
    const normalizedUrl = this.normalizeUrl(url);

    // Skip if already visited
    if (this.visitedUrls.has(normalizedUrl)) {
      return;
    }

    this.visitedUrls.add(normalizedUrl);
    this.logger.debug(`Crawling page (depth ${depth}): ${normalizedUrl}`);

    try {
      const page = await this.browser!.newPage();

      // Navigate to page
      await page.goto(normalizedUrl, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      // Wait a bit for dynamic content
      await page.waitForTimeout(1000);

      // Discover page details
      const pageData = await this.discoverPage(page, normalizedUrl);
      this.discoveredPages.push(pageData);

      await page.close();

      // Recursively crawl linked pages
      for (const link of pageData.links) {
        if (this.shouldCrawlUrl(link, normalizedUrl)) {
          await this.crawlApplication(link, depth + 1);
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to crawl ${normalizedUrl}: ${(error as Error).message}`);
    }
  }

  /**
   * Discover details about a page
   */
  private async discoverPage(page: PlaywrightPage, url: string): Promise<Page> {
    // Get page title
    const title = await page.title();

    // Discover components
    const components = await this.discoverComponents(page);

    // Discover interactive elements
    const interactiveElements = await this.discoverInteractiveElements(page);

    // Extract links
    const links = await this.extractLinks(page, url);

    // Take screenshot
    const screenshotBuffer = await page.screenshot({ fullPage: false });
    const screenshot = screenshotBuffer.toString('base64');

    return {
      url,
      title,
      components,
      interactiveElements,
      links,
      screenshot,
      discoveredAt: new Date(),
    };
  }

  /**
   * Discover components on a page
   */
  private async discoverComponents(page: PlaywrightPage): Promise<PageComponent[]> {
    const components: PageComponent[] = [];

    try {
      // Find all elements matching framework prefix
      const componentElements = await page.locator(`[class*="${this.frameworkPrefix}-"], [id*="${this.frameworkPrefix}-"]`).all();

      // Also search for custom elements with framework prefix
      const customElements = await page.evaluate((prefix) => {
        const elements = document.querySelectorAll('*');
        const found: { tag: string; selector: string; visible: boolean; attrs: Record<string, string> }[] = [];

        elements.forEach((el) => {
          const tagName = el.tagName.toLowerCase();
          if (tagName.startsWith(prefix + '-')) {
            const rect = el.getBoundingClientRect();
            const visible = rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight;

            // Get attributes
            const attrs: Record<string, string> = {};
            for (let i = 0; i < el.attributes.length; i++) {
              const attr = el.attributes[i];
              attrs[attr.name] = attr.value;
            }

            // Generate unique selector
            const id = el.id ? `#${el.id}` : '';
            const classes = el.className ? `.${el.className.split(' ').join('.')}` : '';
            const selector = id || `${tagName}${classes}` || tagName;

            found.push({ tag: tagName, selector, visible, attrs });
          }
        });

        return found;
      }, this.frameworkPrefix);

      // Group by tag name
      const grouped = new Map<string, { selectors: string[]; visible: boolean; attrs: Record<string, string>[] }>();

      for (const el of customElements) {
        if (!grouped.has(el.tag)) {
          grouped.set(el.tag, { selectors: [], visible: false, attrs: [] });
        }

        const group = grouped.get(el.tag)!;
        group.selectors.push(el.selector);
        group.visible = group.visible || el.visible;
        group.attrs.push(el.attrs);
      }

      // Convert to PageComponent format
      for (const [tag, data] of grouped) {
        components.push({
          tag,
          count: data.selectors.length,
          selectors: data.selectors,
          visible: data.visible,
          attributes: data.attrs[0], // Use first instance's attributes as representative
        });
      }

      this.logger.debug(`Found ${components.length} component types on page`);
    } catch (error) {
      this.logger.warn(`Failed to discover components: ${(error as Error).message}`);
    }

    return components;
  }

  /**
   * Discover interactive elements
   */
  private async discoverInteractiveElements(page: PlaywrightPage): Promise<InteractiveElement[]> {
    try {
      const elements = await page.evaluate((prefix) => {
        const interactive: InteractiveElement[] = [];

        // Find buttons
        document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]').forEach((el) => {
          const tagName = el.tagName.toLowerCase();
          interactive.push({
            type: 'button',
            selector: el.id ? `#${el.id}` : tagName,
            text: el.textContent?.trim() || (el as HTMLInputElement).value || '',
            componentTag: tagName.startsWith(prefix) ? tagName : undefined,
          });
        });

        // Find links
        document.querySelectorAll('a[href]').forEach((el) => {
          const anchor = el as HTMLAnchorElement;
          interactive.push({
            type: 'link',
            selector: anchor.id ? `#${anchor.id}` : 'a',
            text: anchor.textContent?.trim() || '',
            href: anchor.href,
            action: 'navigate',
          });
        });

        // Find inputs
        document.querySelectorAll('input:not([type="button"]):not([type="submit"]), textarea').forEach((el) => {
          const tagName = el.tagName.toLowerCase();
          interactive.push({
            type: 'input',
            selector: el.id ? `#${el.id}` : tagName,
            text: (el as HTMLInputElement).placeholder || '',
            componentTag: tagName.startsWith(prefix) ? tagName : undefined,
          });
        });

        // Find forms
        document.querySelectorAll('form').forEach((el) => {
          interactive.push({
            type: 'form',
            selector: el.id ? `#${el.id}` : 'form',
            action: 'submit',
          });
        });

        // Find selects
        document.querySelectorAll('select').forEach((el) => {
          const tagName = el.tagName.toLowerCase();
          interactive.push({
            type: 'select',
            selector: el.id ? `#${el.id}` : tagName,
            componentTag: tagName.startsWith(prefix) ? tagName : undefined,
          });
        });

        return interactive;
      }, this.frameworkPrefix);

      this.logger.debug(`Found ${elements.length} interactive elements`);
      return elements;
    } catch (error) {
      this.logger.warn(`Failed to discover interactive elements: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Extract links from page
   */
  private async extractLinks(page: PlaywrightPage, baseUrl: string): Promise<string[]> {
    try {
      const links = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href]'));
        return anchors.map((a) => (a as HTMLAnchorElement).href);
      });

      // Filter and normalize links
      return links
        .map((link) => this.normalizeUrl(link))
        .filter((link) => this.shouldCrawlUrl(link, baseUrl));
    } catch (error) {
      this.logger.warn(`Failed to extract links: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Build workflows from discovered pages
   */
  private async buildWorkflows(): Promise<Workflow[]> {
    const workflows: Workflow[] = [];

    // Build simple workflows based on navigation paths
    for (const page of this.discoveredPages) {
      // Create a workflow for each page with interactive elements
      if (page.interactiveElements.length > 0) {
        const workflow: Workflow = {
          id: uuidv4(),
          name: `${page.title || 'Page'} Workflow`,
          startPage: page.url,
          steps: this.buildWorkflowSteps(page),
          components: page.components.map((c) => c.tag),
          priority: this.calculatePriority(page),
        };

        workflows.push(workflow);
      }
    }

    // Build cross-page workflows based on links
    this.buildCrossPageWorkflows(workflows);

    return workflows;
  }

  /**
   * Build workflow steps for a page
   */
  private buildWorkflowSteps(page: Page): WorkflowStep[] {
    const steps: WorkflowStep[] = [];

    // Step 1: Navigate to page
    steps.push({
      order: 1,
      page: page.url,
      action: {
        type: 'navigate',
        description: `Navigate to ${page.title || page.url}`,
      },
      expectedOutcome: 'Page loads successfully',
    });

    // Add steps for key interactive elements
    let order = 2;
    for (const element of page.interactiveElements.slice(0, 3)) {
      // Limit to 3 interactions per page
      if (element.type === 'button') {
        steps.push({
          order: order++,
          page: page.url,
          action: {
            type: 'click',
            selector: element.selector,
            description: `Click ${element.text || 'button'}`,
          },
          expectedOutcome: 'Button action completes',
        });
      } else if (element.type === 'input') {
        steps.push({
          order: order++,
          page: page.url,
          action: {
            type: 'input',
            selector: element.selector,
            value: 'test',
            description: `Enter text in ${element.text || 'input'}`,
          },
          expectedOutcome: 'Input accepts text',
        });
      } else if (element.type === 'form') {
        steps.push({
          order: order++,
          page: page.url,
          action: {
            type: 'submit',
            selector: element.selector,
            description: 'Submit form',
          },
          expectedOutcome: 'Form submits successfully',
        });
      }
    }

    return steps;
  }

  /**
   * Build cross-page workflows
   */
  private buildCrossPageWorkflows(workflows: Workflow[]): void {
    // Find pages with links to other pages
    for (const page of this.discoveredPages) {
      const linkElements = page.interactiveElements.filter((el) => el.type === 'link');

      for (const link of linkElements.slice(0, 2)) {
        // Limit to 2 links per page
        if (link.href) {
          const targetPage = this.discoveredPages.find((p) => p.url === link.href);
          if (targetPage) {
            // Create a cross-page workflow
            const workflow: Workflow = {
              id: uuidv4(),
              name: `Navigate from ${page.title} to ${targetPage.title}`,
              startPage: page.url,
              steps: [
                {
                  order: 1,
                  page: page.url,
                  action: {
                    type: 'navigate',
                    description: `Start at ${page.title}`,
                  },
                },
                {
                  order: 2,
                  page: page.url,
                  action: {
                    type: 'click',
                    selector: link.selector,
                    description: `Click link to ${targetPage.title}`,
                  },
                  expectedOutcome: `Navigate to ${targetPage.url}`,
                },
                {
                  order: 3,
                  page: targetPage.url,
                  action: {
                    type: 'wait',
                    description: 'Wait for page load',
                  },
                  expectedOutcome: `${targetPage.title} loads successfully`,
                },
              ],
              components: [
                ...page.components.map((c) => c.tag),
                ...targetPage.components.map((c) => c.tag),
              ],
              priority: 'medium',
            };

            workflows.push(workflow);
          }
        }
      }
    }
  }

  /**
   * Calculate workflow priority
   */
  private calculatePriority(page: Page): 'high' | 'medium' | 'low' {
    // High priority: Root page or pages with many components
    if (page.url === '/' || page.url.endsWith('/') || page.components.length > 5) {
      return 'high';
    }

    // Medium priority: Pages with some interactivity
    if (page.interactiveElements.length > 2) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Analyze component usage across pages
   */
  private analyzeComponentUsage(): ComponentUsageSummary[] {
    const usage = new Map<string, { pages: Set<string>; totalInstances: number; patterns: Set<string> }>();

    for (const page of this.discoveredPages) {
      for (const component of page.components) {
        if (!usage.has(component.tag)) {
          usage.set(component.tag, { pages: new Set(), totalInstances: 0, patterns: new Set() });
        }

        const data = usage.get(component.tag)!;
        data.pages.add(page.url);
        data.totalInstances += component.count;

        // Identify patterns based on context
        if (page.title.toLowerCase().includes('form') || page.url.includes('form')) {
          data.patterns.add('form-input');
        }
        if (page.title.toLowerCase().includes('dashboard') || page.url.includes('dashboard')) {
          data.patterns.add('dashboard-widget');
        }
        if (page.title.toLowerCase().includes('list') || page.url.includes('list')) {
          data.patterns.add('list-item');
        }
      }
    }

    return Array.from(usage.entries()).map(([tag, data]) => ({
      tag,
      pageCount: data.pages.size,
      totalInstances: data.totalInstances,
      pages: Array.from(data.pages),
      patterns: Array.from(data.patterns),
    }));
  }

  /**
   * Normalize URL
   */
  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Remove hash and query params for deduplication
      parsed.hash = '';
      parsed.search = '';
      return parsed.toString().replace(/\/$/, ''); // Remove trailing slash
    } catch {
      return url;
    }
  }

  /**
   * Check if URL should be crawled
   */
  private shouldCrawlUrl(url: string, baseUrl: string): boolean {
    try {
      const parsed = new URL(url);
      const base = new URL(baseUrl);

      // Only crawl same origin
      if (parsed.origin !== base.origin) {
        return false;
      }

      // Skip common non-page URLs
      const skipPatterns = [
        /\.(jpg|jpeg|png|gif|svg|css|js|json|xml|pdf|zip)$/i,
        /^mailto:/,
        /^tel:/,
        /^#/,
        /^javascript:/,
      ];

      for (const pattern of skipPatterns) {
        if (pattern.test(url)) {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get framework prefix from framework name
   */
  private getFrameworkPrefix(frameworkName: string): string {
    const prefixMap: Record<string, string> = {
      '@ui5/webcomponents': 'ui5',
      'ui5-webcomponents': 'ui5',
      '@fluentui/web-components': 'fluent',
      '@shoelace-style/shoelace': 'sl',
      '@material/web': 'md',
    };

    return prefixMap[frameworkName] || 'ui5';
  }
}

export default WorkflowDiscoveryAgent;
