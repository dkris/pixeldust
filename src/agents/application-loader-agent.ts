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

      // Wait for all application containers to be healthy and responding
      await this.waitForApplicationsReady(containers);

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

  /**
   * Wait for application containers to be ready and responding to HTTP requests
   */
  private async waitForApplicationsReady(containers: any[]): Promise<void> {
    this.logger.info('Waiting for application containers to be ready');

    const healthChecks = containers.map(async (container) => {
      const maxRetries = 60; // 60 attempts
      const retryDelay = 2000; // 2 seconds between retries = 2 minutes total

      for (let i = 0; i < maxRetries; i++) {
        try {
          // Check if container is still running
          if (!this.docker) {
            throw new Error('Docker client not initialized');
          }

          const dockerContainer = this.docker.getContainer(container.id);
          const info = await dockerContainer.inspect();

          if (!info.State.Running) {
            this.logger.error(`Container ${container.version} stopped running. Status: ${info.State.Status}`);
            if (info.State.Error) {
              this.logger.error(`Container error: ${info.State.Error}`);
            }

            // Get container logs for debugging
            const logs = await this.getContainerLogs(dockerContainer);
            this.logger.error(`Container logs for ${container.version}:\n${logs}`);

            throw new Error(
              `Container for ${container.version} stopped running (Status: ${info.State.Status}). ` +
              `Please check the logs above for errors.`
            );
          }

          // Make HTTP request to verify application is responding
          try {
            const response = await fetch(container.url, {
              method: 'GET',
              signal: AbortSignal.timeout(5000), // 5 second timeout
            });

            if (response.ok || response.status === 404) {
              // 200 OK or 404 Not Found both indicate server is responding
              this.logger.info(
                `Application ${container.version} is ready and responding at ${container.url}`
              );
              return;
            } else {
              this.logger.debug(
                `Application ${container.version} responded with status ${response.status}, ` +
                `retry ${i + 1}/${maxRetries}`
              );
            }
          } catch (fetchError: any) {
            // Connection errors are expected while application is starting
            if (i % 10 === 0) {
              // Log every 10 retries to avoid spam
              this.logger.info(
                `Attempt ${i + 1}/${maxRetries}: Waiting for ${container.version} at ${container.url}...`
              );
            }
          }
        } catch (error) {
          // If we caught a real error (not just connection refused), re-throw it
          if ((error as Error).message.includes('stopped running')) {
            throw error;
          }

          this.logger.warn(
            `Health check error for ${container.name}, retry ${i + 1}/${maxRetries}: ${(error as Error).message}`
          );
        }

        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }

      // Health check timeout - get logs for debugging
      if (!this.docker) {
        throw new Error('Docker client not initialized');
      }

      const dockerContainer = this.docker.getContainer(container.id);
      const logs = await this.getContainerLogs(dockerContainer);
      this.logger.error(`Application ${container.version} failed health check. Container logs:\n${logs}`);

      throw new Error(
        `Application ${container.version} failed to become ready after ${maxRetries} retries (${maxRetries * retryDelay / 1000} seconds). ` +
        `The application may not have started correctly at ${container.url}. ` +
        `Please check the container logs above for build/startup errors.`
      );
    });

    await Promise.all(healthChecks);
    this.logger.info('All application containers are ready');
  }

  /**
   * Get container logs for debugging
   */
  private async getContainerLogs(container: Dockerode.Container): Promise<string> {
    try {
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail: 100, // Last 100 lines
      });

      return logs.toString('utf-8');
    } catch (error) {
      this.logger.error('Failed to retrieve container logs', error as Error);
      return 'Could not retrieve container logs';
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
CMD ["sh", "-c", "${appConfig.startCommand}"]
`.trim();
  }

  private async buildImage(contextPath: string, imageName: string): Promise<void> {
    if (!this.docker) {
      throw new Error('Container runtime not initialized');
    }

    this.logger.info(`Building image ${imageName} from context: ${contextPath}`);

    try {
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

      await new Promise<void>((resolve, reject) => {
        let hasError = false;
        let errorMessage = '';

        this.docker!.modem.followProgress(
          stream,
          (err, res) => {
            if (err) {
              this.logger.error(`Build stream error: ${err.message}`);
              reject(err);
            } else {
              if (hasError) {
                reject(new Error(`Image build failed: ${errorMessage}`));
              } else {
                resolve();
              }
            }
          },
          (event: any) => {
            // Log build progress
            if (event.stream) {
              this.logger.debug(event.stream.trim());
            }

            // Check for errors in build output
            if (event.error) {
              hasError = true;
              errorMessage = event.error;
              this.logger.error(`Build error: ${event.error}`);
            }

            // Log error details
            if (event.errorDetail) {
              hasError = true;
              errorMessage = event.errorDetail.message || JSON.stringify(event.errorDetail);
              this.logger.error(`Build error detail: ${errorMessage}`);
            }
          }
        );
      });

      // Verify image was created
      const images = await this.docker.listImages({
        filters: { reference: [imageName] }
      });

      if (images.length === 0) {
        throw new Error(`Image ${imageName} was not found after build`);
      }

      this.logger.info(`Image ${imageName} built successfully`);
    } catch (error) {
      this.logger.error(`Failed to build image ${imageName}`, error as Error);
      throw new Error(`Failed to build Docker image ${imageName}: ${(error as Error).message}`);
    }
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
