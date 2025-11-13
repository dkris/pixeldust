import { BaseAgent } from './base-agent';
import { AgentType, AgentContext, AgentResult, Container, ContainerStatus } from '../types';
import Dockerode from 'dockerode';
import { v4 as uuidv4 } from 'uuid';
import { ContainerRuntimeManager } from '../utils/container-runtime';

/**
 * Environment Agent - Manages container lifecycle for version testing
 *
 * Responsibilities:
 * - Create containers for each version (Docker or Podman)
 * - Configure networking
 * - Health checks
 * - Resource management
 * - Cleanup
 *
 * Supports both Docker and Podman with automatic detection and native socket configuration
 */
export class EnvironmentAgent extends BaseAgent {
  private docker: Dockerode | null = null;
  private containers: Map<string, Container> = new Map();
  private runtime: 'docker' | 'podman' = 'docker';
  private isRootless: boolean = false;

  constructor() {
    super(AgentType.ENVIRONMENT);
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const { config, session } = context;

    try {
      // Initialize container runtime (Docker or Podman)
      await this.initializeRuntime(config.containers.runtime);

      this.logger.info(`Setting up environments for ${session.versions.length} versions using ${this.runtime}`);

      const containers: Container[] = [];

      // Create a container for each version
      for (const version of session.versions) {
        const container = await this.createContainer(version, config);
        containers.push(container);
        this.containers.set(version, container);
      }

      // Wait for all containers to be healthy
      await this.waitForHealthy(containers);

      this.logger.info('All containers are ready');

      return this.success({
        containers: containers.map(c => ({
          version: c.version,
          id: c.id,
          ipAddress: c.ipAddress,
          port: c.port,
          runtime: this.runtime,
        })),
        runtime: this.runtime,
        isRootless: this.isRootless,
      });
    } catch (error) {
      await this.cleanup();
      return this.failure(error as Error);
    }
  }

  /**
   * Initialize container runtime (Docker or Podman)
   */
  private async initializeRuntime(preferredRuntime?: 'docker' | 'podman'): Promise<void> {
    try {
      this.logger.info(`Initializing container runtime: ${preferredRuntime || 'auto-detect'}`);

      const { client, config } = await ContainerRuntimeManager.configure(preferredRuntime);

      this.docker = client;
      this.runtime = config.runtime;
      this.isRootless = config.isRootless || false;

      this.logger.info(
        `Container runtime initialized: ${this.runtime} ` +
        `(${this.isRootless ? 'rootless' : 'rootful'}, socket: ${config.socketPath})`
      );
    } catch (error) {
      this.logger.error('Failed to initialize container runtime', error as Error);
      throw error;
    }
  }

  private async createContainer(version: string, config: any): Promise<Container> {
    this.logger.info(`Creating container for version ${version}`);

    const containerName = `pixeldust-${version}-${uuidv4().substring(0, 8)}`;

    try {
      // Pull base image if not exists
      await this.pullImage(config.containers.baseImage);

      if (!this.docker) {
        throw new Error('Docker/Podman client not initialized');
      }

      // Create a simple test HTML page with the framework components
      const testPageHtml = this.generateTestPage(config.framework.name, config.components);

      // Create container with inline setup script
      const setupScript = `
mkdir -p /app
cd /app

# Create package.json
cat > package.json <<'PKGJSON'
{
  "name": "pixeldust-test",
  "version": "1.0.0",
  "dependencies": {
    "${config.framework.name}": "${version}"
  }
}
PKGJSON

# Install dependencies
npm install --quiet

# Create test page
cat > index.html <<'HTMLEOF'
${testPageHtml}
HTMLEOF

# Install and start http-server
npx --yes http-server -p 3000 -s -c-1
`;

      // Create container
      const dockerContainer = await this.docker.createContainer({
        Image: config.containers.baseImage,
        name: containerName,
        Env: [
          `FRAMEWORK_VERSION=${version}`,
          `NODE_ENV=test`,
        ],
        ExposedPorts: {
          '3000/tcp': {},
        },
        HostConfig: {
          Memory: this.parseMemory(config.containers.resources.memory),
          NanoCpus: config.containers.resources.cpu * 1e9,
          PortBindings: {
            '3000/tcp': [{ HostPort: '0' }], // Random port
          },
          AutoRemove: true,
        },
        Cmd: ['sh', '-c', setupScript],
      });

      // Start container
      await dockerContainer.start();

      // Wait a moment for Docker/Podman to assign the random port
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get container info
      const info = await dockerContainer.inspect();

      // Extract and validate port
      const hostPort = info.NetworkSettings.Ports['3000/tcp']?.[0]?.HostPort;
      const port = hostPort ? parseInt(hostPort, 10) : 3000;

      if (!port || isNaN(port)) {
        this.logger.error(`Failed to get valid port for container ${containerName}. NetworkSettings:`, {
          ports: info.NetworkSettings.Ports,
          hostPort,
        });
        throw new Error(`Invalid port for container ${containerName}: ${hostPort}`);
      }

      const container: Container = {
        id: info.Id,
        name: containerName,
        version,
        status: ContainerStatus.RUNNING,
        ipAddress: info.NetworkSettings.IPAddress,
        port,
        createdAt: new Date(),
      };

      this.logger.info(`Container created: ${containerName} (${version}) on port ${container.port}`);

      return container;
    } catch (error) {
      this.logger.error(`Failed to create container for version ${version}`, error as Error);
      throw error;
    }
  }

  private async pullImage(image: string): Promise<void> {
    if (!this.docker) {
      throw new Error('Container runtime not initialized');
    }

    try {
      // Check if image exists locally
      await this.docker.getImage(image).inspect();
      this.logger.debug(`Image ${image} already exists locally`);
    } catch {
      // Pull image
      this.logger.info(`Pulling image ${image}`);
      const stream = await this.docker.pull(image);

      await new Promise((resolve, reject) => {
        this.docker!.modem.followProgress(stream, (err, res) => {
          if (err) reject(err);
          else resolve(res);
        });
      });

      this.logger.info(`Image ${image} pulled successfully`);
    }
  }

  private async waitForHealthy(containers: Container[]): Promise<void> {
    if (!this.docker) {
      throw new Error('Container runtime not initialized');
    }

    this.logger.info('Waiting for containers to be healthy');

    const healthChecks = containers.map(async (container) => {
      const maxRetries = 30;
      const retryDelay = 1000;

      for (let i = 0; i < maxRetries; i++) {
        try {
          const dockerContainer = this.docker!.getContainer(container.id);
          const info = await dockerContainer.inspect();

          if (info.State.Running) {
            // Simple health check: wait a bit for the service to start
            await new Promise(resolve => setTimeout(resolve, 2000));
            this.logger.info(`Container ${container.name} is healthy`);
            return;
          }
        } catch (error) {
          this.logger.warn(`Health check failed for ${container.name}, retry ${i + 1}/${maxRetries}`);
        }

        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }

      throw new Error(`Container ${container.name} failed to become healthy`);
    });

    await Promise.all(healthChecks);
  }

  /**
   * Generate a test HTML page with UI components
   */
  private generateTestPage(frameworkName: string, componentsConfig: any): string {
    // Get list of components to include
    const components = componentsConfig?.include || [
      'ui5-button',
      'ui5-input',
      'ui5-card',
      'ui5-table',
      'ui5-list',
      'ui5-dialog',
    ];

    // Generate import statements for UI5 web components
    const imports = components
      .map((component: string) => {
        // Convert tag name to module path (e.g., ui5-button -> Button)
        const moduleName = component
          .split('-')
          .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
          .join('');
        return `import "${frameworkName}/dist/${moduleName}.js";`;
      })
      .join('\n    ');

    // Generate HTML for each component
    const componentHtml = components
      .map((component: string) => {
        return `
    <section class="component-demo" data-component="${component}">
      <h2>${component}</h2>
      <div class="demo-container">
        <${component} id="${component}-1">Sample ${component}</${component}>
      </div>
    </section>`;
      })
      .join('\n');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PixelDust Test Page</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 20px;
      padding: 20px;
    }
    .component-demo {
      margin: 30px 0;
      padding: 20px;
      border: 1px solid #ccc;
      border-radius: 4px;
    }
    .demo-container {
      margin-top: 15px;
      padding: 15px;
      background: #f5f5f5;
      border-radius: 4px;
    }
    h1 {
      color: #333;
    }
    h2 {
      color: #666;
      margin-top: 0;
    }
  </style>
  <script type="module">
    ${imports}
  </script>
</head>
<body>
  <h1>PixelDust UI Component Test Page</h1>
  <p>This page contains UI components for automated testing.</p>
  ${componentHtml}
</body>
</html>`;
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

  async cleanup(): Promise<void> {
    if (!this.docker) {
      this.logger.warn('Container runtime not initialized, skipping cleanup');
      return;
    }

    this.logger.info('Cleaning up containers');

    for (const [version, container] of this.containers) {
      try {
        const dockerContainer = this.docker.getContainer(container.id);
        await dockerContainer.stop({ t: 5 });
        this.logger.info(`Container ${container.name} stopped`);
      } catch (error) {
        this.logger.warn(`Failed to stop container ${container.name}`, error as Error);
      }
    }

    this.containers.clear();
  }
}

export default EnvironmentAgent;
