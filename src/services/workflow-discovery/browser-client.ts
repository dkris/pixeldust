import { chromium, Browser, Page as PlaywrightPage } from 'playwright';
import Logger from '../../utils/logger';
import { InteractiveElement, PageComponent } from '../../types';
import type { McpClient, McpClientConstructor, McpToolResponse } from '../../types/mcp';

export interface WorkflowDiscoveryBrowserClient {
  start(): Promise<void>;
  stop(): Promise<void>;
  navigate(url: string): Promise<void>;
  getTitle(): Promise<string>;
  queryComponents(prefix: string): Promise<PageComponent[]>;
  queryInteractiveElements(prefix: string): Promise<InteractiveElement[]>;
  extractLinks(baseUrl: string): Promise<string[]>;
  getDomSnapshot(): Promise<string>;
  captureScreenshot(): Promise<string | undefined>;
  getConsoleLogs(): Promise<string[]>;
}

export interface LocalPlaywrightClientOptions {
  headless?: boolean;
  navigationTimeoutMs?: number;
  postNavigationDelayMs?: number;
}

export interface WorkflowDiscoveryMcpClientOptions {
  endpoint: string;
  timeoutMs?: number;
  credentials?: {
    token?: string;
    username?: string;
    password?: string;
  };
  tools?: Partial<McpToolNames>;
}

interface McpToolNames {
  start: string;
  goto: string;
  snapshot: string;
  metadata: string;
  components: string;
  interactive: string;
  links: string;
  screenshot: string;
  console: string;
  close: string;
}

const DEFAULT_MCP_TOOL_NAMES: McpToolNames = {
  start: 'session.start',
  goto: 'page.goto',
  snapshot: 'page.snapshot',
  metadata: 'page.metadata',
  components: 'page.components',
  interactive: 'page.interactiveElements',
  links: 'page.links',
  screenshot: 'page.screenshot',
  console: 'page.consoleLogs',
  close: 'page.close',
};

export class LocalPlaywrightClient implements WorkflowDiscoveryBrowserClient {
  private browser: Browser | null = null;
  private page: PlaywrightPage | null = null;
  private consoleLogs: string[] = [];
  private logger = new Logger('LocalPlaywrightClient');

  constructor(private readonly options: LocalPlaywrightClientOptions = {}) {}

  async start(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: this.options.headless !== false });
    }
  }

  async stop(): Promise<void> {
    if (this.page) {
      await this.page.close().catch(() => undefined);
      this.page = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }
  }

  async navigate(url: string): Promise<void> {
    if (!this.browser) {
      throw new Error('Browser not started');
    }

    if (this.page) {
      await this.page.close().catch(() => undefined);
    }

    this.page = await this.browser.newPage();
    this.consoleLogs = [];
    this.page.on('console', message => {
      this.consoleLogs.push(`[${message.type()}] ${message.text()}`);
    });

    await this.page.goto(url, {
      waitUntil: 'networkidle',
      timeout: this.options.navigationTimeoutMs ?? 30000,
    });

    if (this.options.postNavigationDelayMs !== 0) {
      await this.page.waitForTimeout(this.options.postNavigationDelayMs ?? 1000);
    }
  }

  async getTitle(): Promise<string> {
    if (!this.page) return '';
    return this.page.title();
  }

  async queryComponents(prefix: string): Promise<PageComponent[]> {
    if (!this.page) return [];
    const components: PageComponent[] = [];

    try {
      const customElements = await this.page.evaluate((pfx) => {
        const elements = Array.from(document.querySelectorAll('*'));
        const found: { tag: string; selector: string; visible: boolean; attrs: Record<string, string> }[] = [];

        elements.forEach(el => {
          const tagName = el.tagName.toLowerCase();
          if (tagName.startsWith(`${pfx}-`)) {
            const rect = el.getBoundingClientRect();
            const visible = rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight;
            const attrs: Record<string, string> = {};
            Array.from(el.attributes).forEach(attr => {
              attrs[attr.name] = attr.value;
            });
            const id = el.id ? `#${el.id}` : '';
            const classes = el.className ? `.${el.className.split(' ').join('.')}` : '';
            const selector = id || `${tagName}${classes}` || tagName;
            found.push({ tag: tagName, selector, visible, attrs });
          }
        });

        return found;
      }, prefix);

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

      for (const [tag, data] of grouped) {
        components.push({
          tag,
          count: data.selectors.length,
          selectors: data.selectors,
          visible: data.visible,
          attributes: data.attrs[0],
        });
      }
    } catch (error) {
      this.logger.warn('Failed to query components', error as Error);
    }

    return components;
  }

  async queryInteractiveElements(prefix: string): Promise<InteractiveElement[]> {
    if (!this.page) return [];
    try {
      return await this.page.evaluate((pfx) => {
        const interactive: InteractiveElement[] = [];

        document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]').forEach(el => {
          const tagName = el.tagName.toLowerCase();
          interactive.push({
            type: 'button',
            selector: el.id ? `#${el.id}` : tagName,
            text: el.textContent?.trim() || (el as HTMLInputElement).value || '',
            componentTag: tagName.startsWith(pfx) ? tagName : undefined,
          });
        });

        document.querySelectorAll('a[href]').forEach(el => {
          const anchor = el as HTMLAnchorElement;
          interactive.push({
            type: 'link',
            selector: anchor.id ? `#${anchor.id}` : 'a',
            text: anchor.textContent?.trim() || '',
            href: anchor.href,
            action: 'navigate',
          });
        });

        document.querySelectorAll('input:not([type="button"]):not([type="submit"]), textarea').forEach(el => {
          const tagName = el.tagName.toLowerCase();
          interactive.push({
            type: 'input',
            selector: el.id ? `#${el.id}` : tagName,
            text: (el as HTMLInputElement).placeholder || '',
            componentTag: tagName.startsWith(pfx) ? tagName : undefined,
          });
        });

        document.querySelectorAll('form').forEach(el => {
          interactive.push({
            type: 'form',
            selector: el.id ? `#${el.id}` : 'form',
            action: 'submit',
          });
        });

        document.querySelectorAll('select').forEach(el => {
          const tagName = el.tagName.toLowerCase();
          interactive.push({
            type: 'select',
            selector: el.id ? `#${el.id}` : tagName,
            componentTag: tagName.startsWith(pfx) ? tagName : undefined,
          });
        });

        return interactive;
      }, prefix);
    } catch (error) {
      this.logger.warn('Failed to query interactive elements', error as Error);
      return [];
    }
  }

  async extractLinks(_baseUrl: string): Promise<string[]> {
    if (!this.page) return [];
    try {
      const links = await this.page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href]')).map(a => (a as HTMLAnchorElement).href);
      });
      return links;
    } catch (error) {
      this.logger.warn('Failed to extract links', error as Error);
      return [];
    }
  }

  async getDomSnapshot(): Promise<string> {
    if (!this.page) return '';
    try {
      return await this.page.evaluate(() => document.documentElement.outerHTML);
    } catch (error) {
      this.logger.warn('Failed to capture DOM snapshot', error as Error);
      return '';
    }
  }

  async captureScreenshot(): Promise<string | undefined> {
    if (!this.page) return undefined;
    try {
      const buffer = await this.page.screenshot({ fullPage: false });
      return buffer.toString('base64');
    } catch (error) {
      this.logger.warn('Failed to capture screenshot', error as Error);
      return undefined;
    }
  }

  async getConsoleLogs(): Promise<string[]> {
    return [...this.consoleLogs];
  }
}

export class McpPlaywrightClient implements WorkflowDiscoveryBrowserClient {
  private client: McpClient | null = null;
  private sessionId?: string;
  private readonly toolNames: McpToolNames;
  private logger = new Logger('McpPlaywrightClient');

  constructor(private readonly options: WorkflowDiscoveryMcpClientOptions) {
    this.toolNames = { ...DEFAULT_MCP_TOOL_NAMES, ...(options.tools || {}) };
  }

  async start(): Promise<void> {
    if (this.client) return;
    const Ctor = await loadMcpClientConstructor();
    this.client = new Ctor({
      url: this.options.endpoint,
      apiKey: this.options.credentials?.token,
      headers: this.buildHeaders(),
      timeoutMs: this.options.timeoutMs,
    });

    try {
      const response = await this.callToolPayload<any>(this.toolNames.start, {});
      if (response?.sessionId) {
        this.sessionId = response.sessionId;
      }
    } catch (error) {
      this.logger.warn('Failed to establish MCP session', error as Error);
    }
  }

  async stop(): Promise<void> {
    if (this.client) {
      try {
        await this.callToolPayload(this.toolNames.close, {});
      } catch (error) {
        this.logger.debug('Failed to close remote page', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      await this.client.close().catch(() => undefined);
      this.client = null;
    }
  }

  async navigate(url: string): Promise<void> {
    await this.callToolPayload(this.toolNames.goto, { url });
  }

  async getTitle(): Promise<string> {
    const metadata = await this.callToolPayload<{ title?: string }>(this.toolNames.metadata, {});
    return metadata?.title || '';
  }

  async queryComponents(prefix: string): Promise<PageComponent[]> {
    const result = await this.callToolPayload<{ components?: PageComponent[] }>(this.toolNames.components, {
      prefix,
    });
    return result?.components || [];
  }

  async queryInteractiveElements(prefix: string): Promise<InteractiveElement[]> {
    const result = await this.callToolPayload<{ interactive?: InteractiveElement[] }>(this.toolNames.interactive, {
      prefix,
    });
    return result?.interactive || [];
  }

  async extractLinks(_baseUrl: string): Promise<string[]> {
    const result = await this.callToolPayload<{ links?: string[] }>(this.toolNames.links, {});
    return result?.links || [];
  }

  async getDomSnapshot(): Promise<string> {
    const response = await this.callToolPayload<{ dom?: string }>(this.toolNames.snapshot, {});
    if (typeof response === 'string') {
      return response;
    }
    return response?.dom || '';
  }

  async captureScreenshot(): Promise<string | undefined> {
    const response = await this.requestTool(this.toolNames.screenshot, {});
    if (typeof response.data === 'string') {
      return response.data;
    }
    if (response.artifacts && response.artifacts.length > 0) {
      const artifact = response.artifacts.find(a => a.data);
      if (artifact?.data) {
        return artifact.data;
      }
    }
    return undefined;
  }

  async getConsoleLogs(): Promise<string[]> {
    const result = await this.callToolPayload<{ logs?: string[] }>(this.toolNames.console, {});
    return result?.logs || [];
  }

  private async requestTool(name: string, args?: Record<string, any>): Promise<McpToolResponse> {
    if (!this.client) {
      throw new Error('MCP client not started');
    }

    const payload = {
      ...(this.sessionId ? { sessionId: this.sessionId } : {}),
      ...args,
    };

    const response = await this.client.callTool({
      name,
      arguments: payload,
      timeoutMs: this.options.timeoutMs,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response;
  }

  private async callToolPayload<T>(name: string, args?: Record<string, any>): Promise<T> {
    const response = await this.requestTool(name, args);
    return this.normalizeResponse<T>(response);
  }

  private normalizeResponse<T>(response: McpToolResponse): T {
    if (response.data !== undefined) {
      return response.data as T;
    }
    if (response.output !== undefined) {
      return response.output as T;
    }
    if (response.result !== undefined) {
      return response.result as T;
    }
    if (response.content && response.content.length > 0) {
      const first = response.content[0];
      if (first.data) {
        try {
          return JSON.parse(first.data) as T;
        } catch {
          return first.data as unknown as T;
        }
      }
      if (first.text) {
        return first.text as unknown as T;
      }
    }
    return response as unknown as T;
  }

  private buildHeaders(): Record<string, string> | undefined {
    if (!this.options.credentials) {
      return undefined;
    }
    const headers: Record<string, string> = {};
    if (this.options.credentials.token) {
      headers['Authorization'] = `Bearer ${this.options.credentials.token}`;
    } else if (this.options.credentials.username && this.options.credentials.password) {
      const encoded = Buffer.from(`${this.options.credentials.username}:${this.options.credentials.password}`).toString('base64');
      headers['Authorization'] = `Basic ${encoded}`;
    }
    return Object.keys(headers).length > 0 ? headers : undefined;
  }
}

let mcpClientCtorPromise: Promise<McpClientConstructor | null> | null = null;
async function loadMcpClientConstructor(): Promise<McpClientConstructor> {
  if (!mcpClientCtorPromise) {
    mcpClientCtorPromise = import('@modelcontextprotocol/sdk')
      .then(mod => (mod as any).McpClient || (mod as any).default || null)
      .catch(() => null);
  }
  const ctor = await mcpClientCtorPromise;
  if (!ctor) {
    throw new Error('The @modelcontextprotocol/sdk package is not available. Install it to use the MCP driver.');
  }
  return ctor as McpClientConstructor;
}
