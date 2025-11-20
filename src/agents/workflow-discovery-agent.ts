import { BaseAgent } from './base-agent';
import {
  AgentType,
  AgentContext,
  AgentResult,
  Page,
  Workflow,
  WorkflowStep,
  WorkflowDiscoveryResult,
  ComponentUsageSummary,
  WorkflowDiscoveryDriver,
  WorkflowDiscoveryArtifact,
  WorkflowDiscoveryConfig,
  Config,
} from '../types';
import { URL } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../storage/database';
import {
  WorkflowDiscoveryBrowserClient,
  LocalPlaywrightClient,
  McpPlaywrightClient,
} from '../services/workflow-discovery/browser-client';

type WorkflowDiscoveryClientFactory = (config: Config) => WorkflowDiscoveryBrowserClient;

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
  private client: WorkflowDiscoveryBrowserClient | null = null;
  private visitedUrls: Set<string> = new Set();
  private discoveredPages: Page[] = [];
  private maxDepth: number = 3;
  private maxPages: number = 50;
  private frameworkPrefix: string = 'ui5';
  private driverUsed: WorkflowDiscoveryDriver = 'local';
  private clientFactory?: WorkflowDiscoveryClientFactory;

  constructor(db?: DatabaseManager, clientFactory?: WorkflowDiscoveryClientFactory) {
    super(AgentType.WORKFLOW_DISCOVERY, db);
    this.clientFactory = clientFactory;
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    return this.executeWithTracking(context, async () => {
      const { config, data } = context;

      // Only run workflow discovery in application mode
      if (!config.application) {
        this.logger.info('Skipping workflow discovery (framework-only mode)');
        return this.success({ mode: 'framework-only', workflows: [], pages: [] });
      }

      try {
        this.logger.info('Starting workflow discovery');
        this.visitedUrls.clear();
        this.discoveredPages = [];

        // Get application URL from containers or application config
        const applicationUrl = this.getApplicationUrl(data, config);
        if (!applicationUrl) {
          throw new Error('No application URL available for workflow discovery');
        }

        this.logger.info(`Crawling application: ${applicationUrl}`);

        // Determine framework prefix for component detection
        this.frameworkPrefix = this.getFrameworkPrefix(config.framework.name);

        const driverConfig = this.getDriverConfig(config);
        this.maxDepth = driverConfig.maxDepth ?? this.maxDepth;
        this.maxPages = driverConfig.maxPages ?? this.maxPages;

        // Launch appropriate browser client
        this.client = this.createBrowserClient(config);
        this.driverUsed = driverConfig.driver;
        await this.client.start();

        context.layers.set(
          'shared',
          'workflow.discovery.driver',
          { driver: this.driverUsed, configuredAt: new Date().toISOString() },
          { ttlMs: 30 * 60 * 1000 }
        );

        // Crawl application starting from root
        await this.crawlApplication(context, applicationUrl, 0);

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
          driver: this.driverUsed,
        };

        // Publish layered context artifacts for downstream agents
        context.layers.set('shared', 'workflow.pages', result.pages, { ttlMs: 10 * 60 * 1000 });
        context.layers.set('shared', 'workflow.workflows', result.workflows, { ttlMs: 10 * 60 * 1000 });
        context.layers.set('persistent', 'workflow.componentUsage', result.componentUsage);

        // Index artifacts for selective retrieval
        context.retrieval.index('workflow-pages', result.pages, {
          fingerprint: context.fingerprint,
          idKey: 'url',
          tagExtractor: (page: Page) => page.components?.map(c => c.tag) || [],
          scoreExtractor: (page: Page) => page.components?.length || 1,
          metadataExtractor: (page: Page) => ({ title: page.title }),
        });

        context.retrieval.index('workflows', result.workflows, {
          fingerprint: context.fingerprint,
          idKey: 'id',
          tagExtractor: (workflow: Workflow) => workflow.components || [],
          scoreExtractor: (workflow: Workflow) =>
            workflow.priority === 'high' ? 3 : workflow.priority === 'medium' ? 2 : 1,
          metadataExtractor: (workflow: Workflow) => ({ priority: workflow.priority }),
        });

        context.retrieval.index('component-usage', result.componentUsage, {
          fingerprint: context.fingerprint,
          idKey: 'tag',
          tagExtractor: (usage: ComponentUsageSummary) => usage.patterns || [],
          scoreExtractor: (usage: ComponentUsageSummary) => usage.pageCount,
          metadataExtractor: (usage: ComponentUsageSummary) => ({
            totalInstances: usage.totalInstances,
          }),
        });

        context.memory.remember('WORKFLOW_DISCOVERY', 'latest-summary', {
          pages: result.pages.length,
          workflows: result.workflows.length,
          driver: this.driverUsed,
        }, {
          scope: 'short',
          ttlMs: 30 * 60 * 1000,
          contextFingerprint: context.fingerprint,
        });

        this.logger.info(`Workflow discovery complete:`);
        this.logger.info(`  - ${result.pages.length} pages discovered`);
        this.logger.info(`  - ${result.workflows.length} workflows identified`);
        this.logger.info(`  - ${result.componentUsage.length} unique components`);

        return this.success(result);
      } catch (error) {
        this.logger.error('Workflow discovery failed', error as Error);
        return this.failure(error as Error);
      } finally {
        if (this.client) {
          await this.client.stop().catch(() => undefined);
          this.client = null;
        }
      }
    });
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
  private async crawlApplication(context: AgentContext, url: string, depth: number): Promise<void> {
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
      if (!this.client) {
        throw new Error('Browser client not initialized');
      }

      await this.client.navigate(normalizedUrl);

      // Discover page details
      const pageData = await this.discoverPage(context, normalizedUrl);
      this.discoveredPages.push(pageData);

      // Recursively crawl linked pages
      for (const link of pageData.links) {
        if (this.shouldCrawlUrl(link, normalizedUrl)) {
          await this.crawlApplication(context, link, depth + 1);
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to crawl ${normalizedUrl}: ${(error as Error).message}`);
    }
  }

  /**
   * Discover details about a page
   */
  private async discoverPage(context: AgentContext, url: string): Promise<Page> {
    if (!this.client) {
      throw new Error('Browser client not initialized');
    }

    const [title, components, interactiveElements, rawLinks, screenshot, domSnapshot, consoleLogs] =
      await Promise.all([
        this.client.getTitle(),
        this.client.queryComponents(this.frameworkPrefix),
        this.client.queryInteractiveElements(this.frameworkPrefix),
        this.client.extractLinks(url),
        this.client.captureScreenshot(),
        this.client.getDomSnapshot(),
        this.client.getConsoleLogs(),
      ]);

    const links = rawLinks
      .map(link => this.normalizeUrl(link))
      .filter(link => this.shouldCrawlUrl(link, url));

    this.streamArtifacts(context, {
      url,
      domSnapshot,
      screenshot,
      consoleLogs,
      capturedAt: new Date(),
    });

    return {
      url,
      title,
      components: components || [],
      interactiveElements: interactiveElements || [],
      links,
      screenshot,
      discoveredAt: new Date(),
    };
  }

  private streamArtifacts(context: AgentContext, artifact: WorkflowDiscoveryArtifact): void {
    context.layers.set('ephemeral', `workflow.artifact:${artifact.url}`, artifact, {
      ttlMs: 5 * 60 * 1000,
    });

    if (artifact.domSnapshot) {
      context.retrieval.index(
        'workflow-page-dom',
        [
          {
            url: artifact.url,
            dom: artifact.domSnapshot,
            length: artifact.domSnapshot.length,
          },
        ],
        {
          fingerprint: context.fingerprint,
          idKey: 'url',
          tagExtractor: () => ['workflow', 'dom'],
          scoreExtractor: payload => payload.length || 1,
          metadataExtractor: () => ({ driver: this.driverUsed }),
        }
      );
    }

    if (artifact.screenshot) {
      context.retrieval.index(
        'workflow-screenshots',
        [
          {
            url: artifact.url,
            screenshot: artifact.screenshot,
          },
        ],
        {
          fingerprint: context.fingerprint,
          idKey: 'url',
          tagExtractor: () => ['workflow', 'screenshot'],
          scoreExtractor: () => 1,
          metadataExtractor: () => ({ driver: this.driverUsed }),
        }
      );
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

  private getDriverConfig(config: Config): WorkflowDiscoveryConfig {
    return (
      config.workflowDiscovery || {
        driver: 'local',
        maxDepth: this.maxDepth,
        maxPages: this.maxPages,
      }
    );
  }

  private createBrowserClient(config: Config): WorkflowDiscoveryBrowserClient {
    if (this.clientFactory) {
      return this.clientFactory(config);
    }

    const driverConfig = this.getDriverConfig(config);
    if (driverConfig.driver === 'mcp') {
      if (!driverConfig.mcp?.endpoint) {
        throw new Error('workflowDiscovery.mcp.endpoint is required when driver is set to "mcp"');
      }
      return new McpPlaywrightClient({
        endpoint: driverConfig.mcp.endpoint,
        serverType: driverConfig.mcp.serverType || 'playwright-mcp',
        timeoutMs: driverConfig.mcp.timeoutMs,
        credentials: driverConfig.mcp.credentials,
        tools: driverConfig.mcp.tools,
      });
    }

    return new LocalPlaywrightClient({
      headless: config.testing.headless !== false,
      navigationTimeoutMs: config.testing.timeout,
      postNavigationDelayMs: 1000,
    });
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
