import { BaseAgent } from './base-agent';
import { AgentType, AgentContext, AgentResult } from '../types';
import {
  ContainerProvisioner,
  InlineContainerArtifact,
  ProvisionedContainer,
} from '../services/container-provisioner';

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
  private provisioner: ContainerProvisioner;
  private activeContainers: ProvisionedContainer[] = [];

  constructor() {
    super(AgentType.ENVIRONMENT);
    this.provisioner = new ContainerProvisioner(this.logger);
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const { config, session } = context;

    try {
      const provisioned = await this.provisionContainers(config, session.versions);
      this.activeContainers = provisioned;

      const runtimeInfo = this.provisioner.getRuntimeInfo();

      return this.success({
        containers: provisioned.map(c => ({
          version: c.version,
          id: c.id,
          ipAddress: c.ipAddress,
          port: c.hostPort,
          runtime: runtimeInfo.runtime,
        })),
        runtime: runtimeInfo.runtime,
        isRootless: runtimeInfo.isRootless,
      });
    } catch (error) {
      await this.cleanup();
      return this.failure(error as Error);
    }
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

  async cleanup(): Promise<void> {
    await this.provisioner.cleanup();
    this.activeContainers = [];
  }

  private async provisionContainers(config: any, versions: string[]): Promise<ProvisionedContainer[]> {
    const testPageHtml = this.generateTestPage(config.framework.name, config.components);
    const artifacts: InlineContainerArtifact[] = versions.map(version => ({
      kind: 'inline',
      version,
      image: config.containers.baseImage,
      cmd: ['sh', '-c', this.buildSetupScript(version, config, testPageHtml)],
      port: 3000,
      env: [`FRAMEWORK_VERSION=${version}`, 'NODE_ENV=test'],
      autoRemove: true,
      healthCheck: { type: 'http', retries: 60, intervalMs: 1000 },
    }));

    const containers = await this.provisioner.provision({
      runtime: config.containers.runtime,
      resources: config.containers.resources,
      artifacts,
    });

    return containers;
  }

  private buildSetupScript(version: string, config: any, testPageHtml: string): string {
    return `
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
  }
}

export default EnvironmentAgent;
