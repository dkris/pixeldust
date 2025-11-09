import Dockerode from 'dockerode';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';

const execAsync = promisify(exec);

export interface ContainerRuntimeConfig {
  runtime: 'docker' | 'podman';
  socketPath?: string;
  isRootless?: boolean;
}

/**
 * Container Runtime Manager
 *
 * Handles detection and configuration of Docker and Podman runtimes
 */
export class ContainerRuntimeManager {
  /**
   * Detect available container runtime
   */
  static async detectRuntime(): Promise<'docker' | 'podman' | null> {
    // Check for Docker
    try {
      await execAsync('docker --version');
      return 'docker';
    } catch {}

    // Check for Podman
    try {
      await execAsync('podman --version');
      return 'podman';
    } catch {}

    return null;
  }

  /**
   * Get socket path for Podman
   */
  static async getPodmanSocketPath(): Promise<string> {
    const uid = os.userInfo().uid;

    // Possible Podman socket paths in order of preference
    const socketPaths = [
      // Rootless socket (most common for non-root users)
      `/run/user/${uid}/podman/podman.sock`,
      // Rootful socket
      `/run/podman/podman.sock`,
      // Alternative rootless location
      `${os.homedir()}/.local/share/containers/podman/machine/podman.sock`,
      // XDG_RUNTIME_DIR based
      process.env.XDG_RUNTIME_DIR ? `${process.env.XDG_RUNTIME_DIR}/podman/podman.sock` : null,
    ].filter(Boolean) as string[];

    // Check which socket exists
    for (const socketPath of socketPaths) {
      try {
        await fs.access(socketPath);
        return socketPath;
      } catch {}
    }

    throw new Error(
      'Podman socket not found. Please ensure Podman socket is enabled:\n' +
      '  systemctl --user start podman.socket\n' +
      '  or\n' +
      '  systemctl start podman.socket (for rootful)'
    );
  }

  /**
   * Get socket path for Docker
   */
  static async getDockerSocketPath(): Promise<string> {
    const socketPaths = [
      '/var/run/docker.sock',
      // Docker Desktop on macOS/Windows
      `${os.homedir()}/.docker/run/docker.sock`,
      // Rootless Docker
      process.env.XDG_RUNTIME_DIR ? `${process.env.XDG_RUNTIME_DIR}/docker.sock` : null,
    ].filter(Boolean) as string[];

    for (const socketPath of socketPaths) {
      try {
        await fs.access(socketPath);
        return socketPath;
      } catch {}
    }

    throw new Error('Docker socket not found at /var/run/docker.sock');
  }

  /**
   * Check if Podman is running in rootless mode
   */
  static async isPodmanRootless(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('podman info --format "{{.Host.Security.Rootless}}"');
      return stdout.trim() === 'true';
    } catch {
      // If we can't determine, assume rootless if running as non-root user
      return os.userInfo().uid !== 0;
    }
  }

  /**
   * Create Dockerode instance configured for the specified runtime
   */
  static async createClient(runtime: 'docker' | 'podman'): Promise<Dockerode> {
    if (runtime === 'podman') {
      const socketPath = await this.getPodmanSocketPath();
      const isRootless = await this.isPodmanRootless();

      console.log(`[Podman] Using socket: ${socketPath} (${isRootless ? 'rootless' : 'rootful'})`);

      return new Dockerode({
        socketPath,
        // Podman-specific settings
        timeout: 30000,
      });
    } else {
      const socketPath = await this.getDockerSocketPath();

      console.log(`[Docker] Using socket: ${socketPath}`);

      return new Dockerode({
        socketPath,
      });
    }
  }

  /**
   * Validate that the runtime is working
   */
  static async validateRuntime(client: Dockerode): Promise<boolean> {
    try {
      await client.ping();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get runtime info
   */
  static async getRuntimeInfo(client: Dockerode): Promise<{
    runtime: string;
    version: string;
    apiVersion: string;
  }> {
    const info = await client.version();
    return {
      runtime: info.Components?.find(c => c.Name === 'Podman Engine') ? 'podman' : 'docker',
      version: info.Version || 'unknown',
      apiVersion: info.ApiVersion || 'unknown',
    };
  }

  /**
   * Complete configuration setup
   */
  static async configure(
    preferredRuntime?: 'docker' | 'podman'
  ): Promise<{ client: Dockerode; config: ContainerRuntimeConfig }> {
    let runtime = preferredRuntime;

    // Auto-detect if not specified
    if (!runtime) {
      const detected = await this.detectRuntime();
      if (!detected) {
        throw new Error(
          'No container runtime detected. Please install Docker or Podman:\n' +
          '  Docker: https://docs.docker.com/get-docker/\n' +
          '  Podman: https://podman.io/getting-started/installation'
        );
      }
      runtime = detected;
    }

    // Create client
    const client = await this.createClient(runtime);

    // Validate it works
    const isValid = await this.validateRuntime(client);
    if (!isValid) {
      throw new Error(
        `${runtime} is not running or not accessible. Please start ${runtime}:\n` +
        (runtime === 'podman'
          ? '  systemctl --user start podman.socket'
          : '  systemctl start docker')
      );
    }

    // Get socket path
    const socketPath = runtime === 'podman'
      ? await this.getPodmanSocketPath()
      : await this.getDockerSocketPath();

    const isRootless = runtime === 'podman' ? await this.isPodmanRootless() : false;

    // Get runtime info
    const info = await this.getRuntimeInfo(client);
    console.log(`[Container Runtime] ${info.runtime} ${info.version} (API: ${info.apiVersion})`);

    return {
      client,
      config: {
        runtime,
        socketPath,
        isRootless,
      },
    };
  }
}

export default ContainerRuntimeManager;
