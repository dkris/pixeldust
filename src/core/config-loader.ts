import { cosmiconfig } from 'cosmiconfig';
import { z } from 'zod';
import { Config } from '../types';

/**
 * Zod schema for configuration validation
 */
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
    };
  }

  /**
   * Get default configuration template
   */
  static getDefaultConfig(): Partial<Config> {
    return {
      framework: {
        name: 'ui5-webcomponents',
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
    };
  }
}

export default ConfigLoader;
