import { BaseAgent } from './base-agent';
import { AgentType, AgentContext, AgentResult } from '../types';
import { ContainerRuntimeManager } from '../utils/container-runtime';
import Dockerode from 'dockerode';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

/**
 * Application Loader Agent - Loads and tests real application code
 *
 * Responsibilities:
 * - Mount application code into containers
 * - Build application with each framework version
 * - Verify application builds successfully
 * - Start application for testing
 * - Manage application lifecycle
 */
export class ApplicationLoaderAgent extends BaseAgent {
  private docker: Dockerode | null = null;

  constructor() {
    super(AgentType.APPLICATION_LOADER);
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const { config, session } = context;

    if (!config.application) {
      this.logger.info('No application configuration found, skipping application loading');
      return this.success({ mode: 'framework-only' });
    }

    try {
      this.logger.info('Loading application for testing');

      // Initialize container runtime
      const { client } = await ContainerRuntimeManager.configure(config.containers.runtime);
      this.docker = client;

      // Validate application path
      await this.validateApplication(config.application);

      // Create workspace for each version
      const workspaces = await this.createWorkspaces(
        config.application.path,
        session.versions
      );

      // Build containers with application code
      const containers = [];
      for (const version of session.versions) {
        const container = await this.buildApplicationContainer(
          version,
          workspaces[version],
          config
        );
        containers.push(container);
      }

      this.logger.info(`Successfully loaded application for ${containers.length} versions`);

      return this.success({
        mode: 'application',
        workspaces,
        containers: containers.map(c => ({
          version: c.version,
          id: c.id,
          url: c.url,
        })),
      });
    } catch (error) {
      return this.failure(error as Error);
    }
  }

  private async validateApplication(appConfig: any): Promise<void> {
    this.logger.info(`Validating application at ${appConfig.path}`);

    // Check if path exists
    try {
      await fs.access(appConfig.path);
    } catch {
      throw new Error(`Application path not found: ${appConfig.path}`);
    }

    // Check for package.json
    const packageJsonPath = path.join(appConfig.path, 'package.json');
    try {
      await fs.access(packageJsonPath);
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(content);
      this.logger.info(`Found application: ${pkg.name}@${pkg.version}`);
    } catch {
      throw new Error('No package.json found in application directory');
    }

    this.logger.info('Application validation passed');
  }

  private async createWorkspaces(
    appPath: string,
    versions: string[]
  ): Promise<Record<string, string>> {
    const workspaces: Record<string, string> = {};

    for (const version of versions) {
      const workspaceDir = path.join('/tmp', 'pixeldust', uuidv4(), version);
      await fs.mkdir(workspaceDir, { recursive: true });

      // Copy application to workspace
      await this.copyDirectory(appPath, workspaceDir);

      workspaces[version] = workspaceDir;
      this.logger.info(`Created workspace for ${version}: ${workspaceDir}`);
    }

    return workspaces;
  }

  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      // Skip node_modules, .git, and build directories
      if (['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) {
        continue;
      }

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  private async buildApplicationContainer(
    version: string,
    workspacePath: string,
    config: any
  ): Promise<any> {
    if (!this.docker) {
      throw new Error('Container runtime not initialized');
    }

    this.logger.info(`Building application container for version ${version}`);

    const containerName = `pixeldust-app-${version}-${uuidv4().substring(0, 8)}`;
    const appConfig = config.application;

    try {
      // Create Dockerfile
      const dockerfile = this.generateDockerfile(version, config);
      const dockerfilePath = path.join(workspacePath, 'Dockerfile.pixeldust');
      await fs.writeFile(dockerfilePath, dockerfile);

      // Build image
      const imageName = `pixeldust-app:${version}`;
      await this.buildImage(workspacePath, imageName);

      // Create and start container
      const container = await this.docker.createContainer({
        Image: imageName,
        name: containerName,
        Env: [
          `FRAMEWORK_VERSION=${version}`,
          `NODE_ENV=test`,
        ],
        ExposedPorts: {
          [`${appConfig.port}/tcp`]: {},
        },
        HostConfig: {
          Memory: this.parseMemory(config.containers.resources.memory),
          NanoCpus: config.containers.resources.cpu * 1e9,
          PortBindings: {
            [`${appConfig.port}/tcp`]: [{ HostPort: '0' }],
          },
          AutoRemove: true,
        },
      });

      await container.start();
      const info = await container.inspect();

      const hostPort = parseInt(
        info.NetworkSettings.Ports[`${appConfig.port}/tcp`]?.[0]?.HostPort || appConfig.port
      );

      this.logger.info(`Application started on port ${hostPort} for version ${version}`);

      return {
        id: info.Id,
        name: containerName,
        version,
        url: `http://localhost:${hostPort}`,
      };
    } catch (error) {
      this.logger.error(`Failed to build application container for ${version}`, error as Error);
      throw error;
    }
  }

  private generateDockerfile(version: string, config: any): string {
    const appConfig = config.application;
    const framework = config.framework;

    return `
FROM ${config.containers.baseImage}

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Install specific framework version
RUN npm install ${framework.name}@${version}

# Copy application code
COPY . .

# Build application
RUN ${appConfig.buildCommand}

# Expose port
EXPOSE ${appConfig.port}

# Start application
CMD ${appConfig.startCommand}
`.trim();
  }

  private async buildImage(contextPath: string, imageName: string): Promise<void> {
    if (!this.docker) {
      throw new Error('Container runtime not initialized');
    }

    this.logger.info(`Building image ${imageName}`);

    const stream = await this.docker.buildImage(
      {
        context: contextPath,
        src: ['.'],
      },
      {
        t: imageName,
        dockerfile: 'Dockerfile.pixeldust',
      }
    );

    await new Promise((resolve, reject) => {
      this.docker!.modem.followProgress(stream, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    });

    this.logger.info(`Image ${imageName} built successfully`);
  }

  private parseMemory(memStr: string): number {
    const units: Record<string, number> = {
      b: 1,
      k: 1024,
      m: 1024 * 1024,
      g: 1024 * 1024 * 1024,
    };

    const match = memStr.toLowerCase().match(/^(\d+)([bkmg])$/);
    if (!match) {
      throw new Error(`Invalid memory format: ${memStr}`);
    }

    return parseInt(match[1]) * units[match[2]];
  }
}

export default ApplicationLoaderAgent;
