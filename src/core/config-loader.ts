import { cosmiconfig } from 'cosmiconfig';
import { z } from 'zod';
import { Config } from '../types';

/**
 * Zod schema for configuration validation
 */
const WorkflowDiscoverySchema = z
  .object({
    driver: z.enum(['local', 'mcp']).default('local'),
    maxDepth: z.number().min(1).max(10).default(3),
    maxPages: z.number().min(1).max(200).default(50),
    mcp: z
      .object({
        endpoint: z.string().url(),
        serverType: z.enum(['custom', 'playwright-mcp']).optional().default('playwright-mcp'),
        timeoutMs: z.number().optional(),
        credentials: z
          .object({
            token: z.string().optional(),
            username: z.string().optional(),
            password: z.string().optional(),
          })
          .partial()
          .optional(),
        tools: z
          .object({
            start: z.string().optional(),
            goto: z.string().optional(),
            snapshot: z.string().optional(),
            metadata: z.string().optional(),
            components: z.string().optional(),
            interactive: z.string().optional(),
            links: z.string().optional(),
            screenshot: z.string().optional(),
            console: z.string().optional(),
            close: z.string().optional(),
          })
          .partial()
          .optional(),
      })
      .optional(),
  })
  .default({ driver: 'local', maxDepth: 3, maxPages: 50 });

const ConfigSchema = z.object({
  framework: z.object({
    name: z.string(),
    versions: z.array(z.string()).min(1),
  }),
  components: z.object({
    include: z.array(z.string()).optional(),
    exclude: z.array(z.string()).optional(),
  }).optional().default({}),
  containers: z.object({
    runtime: z.enum(['podman', 'docker']),
    baseImage: z.string(),
    resources: z.object({
      memory: z.string(),
      cpu: z.number(),
    }),
    network: z.object({
      mode: z.enum(['bridge', 'host', 'none']).optional(),
    }).optional(),
  }),
  testing: z.object({
    browsers: z.array(z.enum(['chromium', 'firefox', 'webkit'])),
    viewport: z.object({
      width: z.number(),
      height: z.number(),
    }),
    timeout: z.number(),
    retries: z.number(),
    headless: z.boolean().optional().default(true),
  }),
  analysis: z.object({
    visualThreshold: z.number().min(0).max(1),
    domIgnoreAttributes: z.array(z.string()).optional(),
    performanceThresholds: z.object({
      fcp: z.number(),
      lcp: z.number(),
      tti: z.number(),
    }).optional(),
  }),
  ai: z.object({
    provider: z.enum(['anthropic', 'openai']),
    model: z.string(),
    apiKey: z.string().optional(),
    temperature: z.number().optional().default(0.7),
    maxTokens: z.number().optional().default(4096),
  }),
  storage: z.object({
    type: z.enum(['local', 's3']),
    path: z.string(),
    s3: z.object({
      bucket: z.string(),
      region: z.string(),
      accessKeyId: z.string().optional(),
      secretAccessKey: z.string().optional(),
    }).optional(),
  }),
  reporting: z.object({
    format: z.array(z.enum(['markdown', 'html', 'json'])),
    outputPath: z.string(),
  }),
  application: z.object({
    path: z.string(),
    entryPoint: z.string().optional(),
    buildCommand: z.string(),
    startCommand: z.string(),
    testCommand: z.string().optional(),
    port: z.number(),
    testPaths: z.array(z.string()).optional(),
    sourcePaths: z.array(z.string()).optional(),
    packageJson: z.string().optional(),
  }).optional(),
  upgrade: z.object({
    updatePeerDependencies: z.boolean().default(true),
    resolveConflicts: z.enum(['auto', 'manual']).optional(),
    fixTests: z.boolean().default(true),
    testTimeout: z.number().optional(),
    incremental: z.boolean().optional(),
    createBranches: z.boolean().optional(),
  }).optional(),
  orchestration: z
    .object({
      mode: z.enum(['hybrid', 'legacy']).default('hybrid'),
      usePipeline: z.boolean().optional().default(true),
    })
    .default({ mode: 'hybrid', usePipeline: true }),
  workflowDiscovery: WorkflowDiscoverySchema,
  runtime: z
    .object({
      enabled: z.boolean().default(false),
      appId: z.string(),
      ingestEndpoint: z.string().url().optional(),
      sdkVersion: z.string().default('1.0.0'),
      trafficSampling: z.number().min(0).max(1).default(0.1),
      frictionThreshold: z
        .object({
          rageClicks: z.number().default(3),
          formAbandonmentMinFields: z.number().default(2),
          errorClickCount: z.number().default(2),
        })
        .default({ rageClicks: 3, formAbandonmentMinFields: 2, errorClickCount: 2 }),
      experiment: z
        .object({
          defaultTrafficPercent: z.number().min(1).max(50).default(10),
          minConfidenceThreshold: z.number().min(0.5).max(0.999).default(0.95),
          minSampleSize: z.number().default(100),
          maxConcurrentExperiments: z.number().default(5),
          autoPromote: z.boolean().default(false),
          autoRevert: z.boolean().default(true),
          pollIntervalMs: z.number().default(60000),
        })
        .default({}),
      visualValidation: z.boolean().default(true),
    })
    .optional(),
});

/**
 * Configuration loader with validation
 */
export class ConfigLoader {
  private explorer = cosmiconfig('pixeldust');

  async load(configPath?: string): Promise<Config> {
    let result;

    if (configPath) {
      result = await this.explorer.load(configPath);
    } else {
      result = await this.explorer.search();
    }

    if (!result || !result.config) {
      throw new Error('No configuration file found. Run "pixeldust init" to create one.');
    }

    // Merge with environment variables
    const config = this.mergeWithEnv(result.config);

    // Validate configuration
    try {
      return ConfigSchema.parse(config) as Config;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
        throw new Error(`Configuration validation failed:\n${issues}`);
      }
      throw error;
    }
  }

  private mergeWithEnv(config: any): any {
    return {
      ...config,
      ai: {
        ...config.ai,
        apiKey: config.ai.apiKey || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY,
      },
      storage: {
        ...config.storage,
        s3: config.storage.s3 ? {
          ...config.storage.s3,
          accessKeyId: config.storage.s3.accessKeyId || process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: config.storage.s3.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY,
        } : undefined,
      },
      workflowDiscovery: {
        ...config.workflowDiscovery,
        mcp: config.workflowDiscovery?.mcp
          ? {
              ...config.workflowDiscovery.mcp,
              endpoint: config.workflowDiscovery.mcp.endpoint || process.env.PIXELDUST_MCP_ENDPOINT,
              timeoutMs:
                config.workflowDiscovery.mcp.timeoutMs ||
                (process.env.PIXELDUST_MCP_TIMEOUT
                  ? parseInt(process.env.PIXELDUST_MCP_TIMEOUT, 10)
                  : undefined),
              credentials: {
                ...config.workflowDiscovery.mcp.credentials,
                token:
                  config.workflowDiscovery.mcp.credentials?.token || process.env.PIXELDUST_MCP_TOKEN,
                username:
                  config.workflowDiscovery.mcp.credentials?.username || process.env.PIXELDUST_MCP_USERNAME,
                password:
                  config.workflowDiscovery.mcp.credentials?.password || process.env.PIXELDUST_MCP_PASSWORD,
              },
            }
          : config.workflowDiscovery?.driver === 'mcp'
          ? {
              endpoint: process.env.PIXELDUST_MCP_ENDPOINT || '',
              timeoutMs: process.env.PIXELDUST_MCP_TIMEOUT
                ? parseInt(process.env.PIXELDUST_MCP_TIMEOUT, 10)
                : undefined,
              credentials: {
                token: process.env.PIXELDUST_MCP_TOKEN,
                username: process.env.PIXELDUST_MCP_USERNAME,
                password: process.env.PIXELDUST_MCP_PASSWORD,
              },
            }
          : config.workflowDiscovery?.mcp,
      },
    };
  }

  /**
   * Get default configuration template
   */
  static getDefaultConfig(): Partial<Config> {
    return {
      framework: {
        name: '@ui5/webcomponents',
        versions: ['1.0.0', '2.0.0'],
      },
      components: {
        include: [],
        exclude: [],
      },
      containers: {
        runtime: 'docker',
        baseImage: 'node:18-alpine',
        resources: {
          memory: '2g',
          cpu: 2,
        },
      },
      testing: {
        browsers: ['chromium'],
        viewport: {
          width: 1920,
          height: 1080,
        },
        timeout: 30000,
        retries: 2,
        headless: true,
      },
      analysis: {
        visualThreshold: 0.1,
        domIgnoreAttributes: ['data-testid', 'data-qa'],
        performanceThresholds: {
          fcp: 1800,
          lcp: 2500,
          tti: 3800,
        },
      },
      ai: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        temperature: 0.7,
        maxTokens: 4096,
      },
      storage: {
        type: 'local',
        path: './data',
      },
      reporting: {
        format: ['markdown', 'html'],
        outputPath: './reports',
      },
      upgrade: {
        updatePeerDependencies: true,
        fixTests: true,
      },
      orchestration: {
        mode: 'hybrid',
        usePipeline: true,
      },
      workflowDiscovery: {
        driver: 'local',
        maxDepth: 3,
        maxPages: 50,
      },
    };
  }
}

export default ConfigLoader;
