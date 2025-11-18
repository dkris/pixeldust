import { BaseAgent } from './base-agent';
import { AgentType, AgentContext, AgentResult } from '../types';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import {
  ContainerProvisioner,
  ProvisionedContainer,
  WorkspaceContainerArtifact,
} from '../services/container-provisioner';

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
  private provisioner: ContainerProvisioner;

  constructor() {
    super(AgentType.APPLICATION_LOADER);
    this.provisioner = new ContainerProvisioner(this.logger);
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const { config, session } = context;

    if (!config.application) {
      this.logger.info('No application configuration found, skipping application loading');
      return this.success({ mode: 'framework-only' });
    }

    try {
      this.logger.info('Loading application for testing');

      // Validate application path
      await this.validateApplication(config.application);

      // Create workspace for each version
      const workspaces = await this.createWorkspaces(
        config.application.path,
        session.versions
      );

      // Build containers with application code
      const containers = await this.provisionApplicationContainers(
        workspaces,
        config,
        session.versions
      );

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

  private async provisionApplicationContainers(
    workspaces: Record<string, string>,
    config: any,
    versions: string[],
  ): Promise<ProvisionedContainer[]> {
    const appConfig = config.application;
    const artifacts: WorkspaceContainerArtifact[] = [];

    for (const version of versions) {
      const workspacePath = workspaces[version];
      const dockerfile = this.generateDockerfile(version, config);
      const dockerfilePath = path.join(workspacePath, 'Dockerfile.pixeldust');
      await fs.writeFile(dockerfilePath, dockerfile);

      artifacts.push({
        kind: 'workspace',
        version,
        contextPath: workspacePath,
        imageTag: `pixeldust-app:${version}`,
        dockerfileName: 'Dockerfile.pixeldust',
        port: appConfig.port,
        env: [`FRAMEWORK_VERSION=${version}`, 'NODE_ENV=test'],
        healthCheck: { type: 'http', retries: 60, intervalMs: 2000 },
      });
    }

    const containers = await this.provisioner.provision({
      runtime: config.containers.runtime,
      resources: config.containers.resources,
      artifacts,
    });

    return containers;
  }
}

export default ApplicationLoaderAgent;
