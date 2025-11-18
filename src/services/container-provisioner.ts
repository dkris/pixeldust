import Dockerode from 'dockerode';
import { v4 as uuidv4 } from 'uuid';
import { ContainerRuntimeManager } from '../utils/container-runtime';

export interface ContainerProvisionerLogger {
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, error?: Error | any): void;
  debug(message: string, meta?: any): void;
}

export type ContainerArtifact = WorkspaceContainerArtifact | InlineContainerArtifact;

interface BaseContainerArtifact {
  version: string;
  port: number;
  env?: string[];
  labels?: Record<string, string>;
  healthCheck?: HttpHealthCheckOptions;
  autoRemove?: boolean;
}

export interface WorkspaceContainerArtifact extends BaseContainerArtifact {
  kind: 'workspace';
  contextPath: string;
  imageTag: string;
  dockerfileName?: string;
}

export interface InlineContainerArtifact extends BaseContainerArtifact {
  kind: 'inline';
  image: string;
  cmd: string[];
}

export interface HttpHealthCheckOptions {
  type: 'http';
  path?: string;
  method?: 'GET' | 'HEAD';
  retries?: number;
  intervalMs?: number;
}

export interface ContainerProvisionRequest {
  runtime?: 'docker' | 'podman';
  resources: { memory: string; cpu: number };
  artifacts: ContainerArtifact[];
}

export interface ProvisionedContainer {
  id: string;
  name: string;
  version: string;
  port: number;
  hostPort: number;
  url: string;
  ipAddress?: string;
  healthCheck?: HttpHealthCheckOptions;
}

interface TrackedContainer {
  name: string;
  container: Dockerode.Container;
  autoRemove?: boolean;
}

export class ContainerProvisioner {
  private docker: Dockerode | null = null;
  private runtime: 'docker' | 'podman' = 'docker';
  private isRootless = false;
  private trackedContainers: Map<string, TrackedContainer> = new Map();

  constructor(private logger: ContainerProvisionerLogger) {}

  async provision(options: ContainerProvisionRequest): Promise<ProvisionedContainer[]> {
    await this.ensureRuntime(options.runtime);

    const provisioned: ProvisionedContainer[] = [];

    try {
      for (const artifact of options.artifacts) {
        if (artifact.kind === 'workspace') {
          await this.buildImage({
            contextPath: artifact.contextPath,
            dockerfile: artifact.dockerfileName || 'Dockerfile.pixeldust',
            imageTag: artifact.imageTag,
          });

          const container = await this.createAndStartContainer({
            image: artifact.imageTag,
            version: artifact.version,
            port: artifact.port,
            env: artifact.env,
            cmd: undefined,
            autoRemove: artifact.autoRemove,
            resources: options.resources,
            healthCheck: artifact.healthCheck,
            labels: artifact.labels,
          });

          provisioned.push(container);
        } else {
          await this.pullImage(artifact.image);

          const container = await this.createAndStartContainer({
            image: artifact.image,
            version: artifact.version,
            port: artifact.port,
            env: artifact.env,
            cmd: artifact.cmd,
            autoRemove: artifact.autoRemove,
            resources: options.resources,
            healthCheck: artifact.healthCheck,
            labels: artifact.labels,
          });

          provisioned.push(container);
        }
      }

      await this.waitForHealth(provisioned);
      return provisioned;
    } catch (error) {
      await this.cleanup(provisioned.map(container => container.id));
      throw error;
    }
  }

  async cleanup(containerIds?: string[]): Promise<void> {
    if (!this.docker || this.trackedContainers.size === 0) {
      return;
    }

    const targets = containerIds?.length
      ? containerIds.filter(id => this.trackedContainers.has(id))
      : Array.from(this.trackedContainers.keys());

    for (const id of targets) {
      const tracked = this.trackedContainers.get(id);
      if (!tracked) continue;

      try {
        if (!tracked.autoRemove) {
          await tracked.container.stop({ t: 5 });
        }
        this.logger.info(`Container ${tracked.name} stopped`);
      } catch (error) {
        this.logger.warn(`Failed to stop container ${tracked.name}`, error as Error);
      } finally {
        this.trackedContainers.delete(id);
      }
    }
  }

  getRuntimeInfo(): { runtime: 'docker' | 'podman'; isRootless: boolean } {
    return { runtime: this.runtime, isRootless: this.isRootless };
  }

  private async ensureRuntime(preferred?: 'docker' | 'podman'): Promise<void> {
    if (this.docker) {
      return;
    }

    const { client, config } = await ContainerRuntimeManager.configure(preferred);
    this.docker = client;
    this.runtime = config.runtime;
    this.isRootless = config.isRootless || false;

    this.logger.info(
      `Container runtime initialized: ${this.runtime} (${this.isRootless ? 'rootless' : 'rootful'})`
    );
  }

  private async buildImage(options: { contextPath: string; dockerfile: string; imageTag: string }): Promise<void> {
    if (!this.docker) {
      throw new Error('Container runtime not initialized');
    }

    this.logger.info(`Building image ${options.imageTag} from ${options.contextPath}`);

    const stream = await this.docker.buildImage(
      {
        context: options.contextPath,
        src: ['.'],
      },
      {
        t: options.imageTag,
        dockerfile: options.dockerfile,
      }
    );

    await new Promise<void>((resolve, reject) => {
      let hasError = false;
      let errorMessage = '';

      this.docker!.modem.followProgress(
        stream,
        (err) => {
          if (err) {
            reject(err);
          } else if (hasError) {
            reject(new Error(`Image build failed: ${errorMessage}`));
          } else {
            resolve();
          }
        },
        (event: any) => {
          if (event.stream) {
            this.logger.debug(event.stream.trim());
          }

          if (event.error) {
            hasError = true;
            errorMessage = event.error;
            this.logger.error(`Build error: ${event.error}`);
          }

          if (event.errorDetail) {
            hasError = true;
            errorMessage = event.errorDetail.message || JSON.stringify(event.errorDetail);
            this.logger.error(`Build error detail: ${errorMessage}`);
          }
        }
      );
    });

    const images = await this.docker.listImages({ filters: { reference: [options.imageTag] } });
    if (images.length === 0) {
      throw new Error(`Image ${options.imageTag} was not created`);
    }

    this.logger.info(`Image ${options.imageTag} built successfully`);
  }

  private async pullImage(image: string): Promise<void> {
    if (!this.docker) {
      throw new Error('Container runtime not initialized');
    }

    try {
      await this.docker.getImage(image).inspect();
      this.logger.debug(`Image ${image} already available locally`);
      return;
    } catch {}

    this.logger.info(`Pulling image ${image}`);
    const stream = await this.docker.pull(image);

    await new Promise<void>((resolve, reject) => {
      this.docker!.modem.followProgress(stream, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    this.logger.info(`Image ${image} pulled successfully`);
  }

  private async createAndStartContainer(options: {
    image: string;
    version: string;
    port: number;
    env?: string[];
    cmd?: string[];
    autoRemove?: boolean;
    resources: { memory: string; cpu: number };
    healthCheck?: HttpHealthCheckOptions;
    labels?: Record<string, string>;
  }): Promise<ProvisionedContainer> {
    if (!this.docker) {
      throw new Error('Container runtime not initialized');
    }

    const containerName = `pixeldust-${options.version}-${uuidv4().substring(0, 8)}`;
    const dockerContainer = await this.docker.createContainer({
      Image: options.image,
      name: containerName,
      Env: options.env,
      ExposedPorts: { [`${options.port}/tcp`]: {} },
      HostConfig: {
        Memory: this.parseMemory(options.resources.memory),
        NanoCpus: options.resources.cpu * 1e9,
        PortBindings: { [`${options.port}/tcp`]: [{ HostPort: '0' }] },
        AutoRemove: options.autoRemove || false,
      },
      Cmd: options.cmd,
      Labels: options.labels,
    });

    await dockerContainer.start();

    const info = await dockerContainer.inspect();
    const hostPortStr = info.NetworkSettings.Ports?.[`${options.port}/tcp`]?.[0]?.HostPort;
    const hostPort = hostPortStr ? parseInt(hostPortStr, 10) : options.port;

    const provisioned: ProvisionedContainer = {
      id: info.Id,
      name: containerName,
      version: options.version,
      port: options.port,
      hostPort,
      url: `http://localhost:${hostPort}`,
      ipAddress: info.NetworkSettings.IPAddress,
      healthCheck: options.healthCheck,
    };

    this.trackedContainers.set(info.Id, { name: containerName, container: dockerContainer, autoRemove: options.autoRemove });

    this.logger.info(`Container ${containerName} started for version ${options.version} on port ${hostPort}`);

    return provisioned;
  }

  private async waitForHealth(containers: ProvisionedContainer[]): Promise<void> {
    if (!this.docker) {
      throw new Error('Container runtime not initialized');
    }

    const checks = containers.map(async (container) => {
      const options = container.healthCheck || { type: 'http', retries: 60, intervalMs: 2000 };
      const retries = options.retries ?? 60;
      const delay = options.intervalMs ?? 2000;
      const path = options.path || '/';
      const method = options.method || 'GET';

      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          const dockerContainer = this.docker!.getContainer(container.id);
          const info = await dockerContainer.inspect();

          if (!info.State.Running) {
            const logs = await this.getContainerLogs(dockerContainer);
            throw new Error(
              `Container ${container.name} stopped (status: ${info.State.Status}). Logs:\n${logs}`
            );
          }

          const response = await fetch(`${container.url}${path}`, {
            method,
            signal: AbortSignal.timeout(5000),
          });

          if (response.ok || response.status === 404) {
            this.logger.info(`Container ${container.name} is healthy at ${container.url}${path}`);
            return;
          }

          this.logger.debug(
            `Health check for ${container.name} responded with ${response.status}, retry ${attempt + 1}/${retries}`
          );
        } catch (error) {
          this.logger.debug(
            `Health check attempt ${attempt + 1}/${retries} failed for ${container.name}: ${(error as Error).message}`
          );
        }

        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const dockerContainer = this.docker.getContainer(container.id);
      const logs = await this.getContainerLogs(dockerContainer);
      throw new Error(
        `Container ${container.name} failed health checks after ${retries} attempts. Logs:\n${logs}`
      );
    });

    await Promise.all(checks);
  }

  private async getContainerLogs(container: Dockerode.Container): Promise<string> {
    try {
      const logs = await container.logs({ stdout: true, stderr: true, tail: 100 });
      return logs.toString('utf-8');
    } catch (error) {
      this.logger.error('Failed to retrieve container logs', error as Error);
      return 'Could not retrieve container logs';
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

    return parseInt(match[1], 10) * units[match[2]];
  }
}

export default ContainerProvisioner;
