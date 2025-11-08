import { BaseAgent } from './base-agent';
import { AgentType, AgentContext, AgentResult, Container, ContainerStatus } from '../types';
import Dockerode from 'dockerode';
import { v4 as uuidv4 } from 'uuid';

/**
 * Environment Agent - Manages container lifecycle for version testing
 *
 * Responsibilities:
 * - Create containers for each version
 * - Configure networking
 * - Health checks
 * - Resource management
 * - Cleanup
 */
export class EnvironmentAgent extends BaseAgent {
  private docker: Dockerode;
  private containers: Map<string, Container> = new Map();

  constructor() {
    super(AgentType.ENVIRONMENT);
    this.docker = new Dockerode();
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const { config, session } = context;

    try {
      this.logger.info(`Setting up environments for ${session.versions.length} versions`);

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
        })),
      });
    } catch (error) {
      await this.cleanup();
      return this.failure(error as Error);
    }
  }

  private async createContainer(version: string, config: any): Promise<Container> {
    this.logger.info(`Creating container for version ${version}`);

    const containerName = `pixeldust-${version}-${uuidv4().substring(0, 8)}`;

    try {
      // Pull base image if not exists
      await this.pullImage(config.containers.baseImage);

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
        Cmd: [
          'sh',
          '-c',
          `npm install ${config.framework.name}@${version} && npx http-server -p 3000`,
        ],
      });

      // Start container
      await dockerContainer.start();

      // Get container info
      const info = await dockerContainer.inspect();

      const container: Container = {
        id: info.Id,
        name: containerName,
        version,
        status: ContainerStatus.RUNNING,
        ipAddress: info.NetworkSettings.IPAddress,
        port: parseInt(info.NetworkSettings.Ports['3000/tcp']?.[0]?.HostPort || '3000'),
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
    try {
      // Check if image exists locally
      await this.docker.getImage(image).inspect();
      this.logger.debug(`Image ${image} already exists locally`);
    } catch {
      // Pull image
      this.logger.info(`Pulling image ${image}`);
      const stream = await this.docker.pull(image);

      await new Promise((resolve, reject) => {
        this.docker.modem.followProgress(stream, (err, res) => {
          if (err) reject(err);
          else resolve(res);
        });
      });

      this.logger.info(`Image ${image} pulled successfully`);
    }
  }

  private async waitForHealthy(containers: Container[]): Promise<void> {
    this.logger.info('Waiting for containers to be healthy');

    const healthChecks = containers.map(async (container) => {
      const maxRetries = 30;
      const retryDelay = 1000;

      for (let i = 0; i < maxRetries; i++) {
        try {
          const dockerContainer = this.docker.getContainer(container.id);
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
