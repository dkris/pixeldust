import { BaseAgent } from './base-agent';
import { AgentType, AgentContext, AgentResult } from '../types';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { getRelatedPackages, getUpgradeStrategy, isReactFramework } from '../utils/framework-detector';
import { DatabaseManager } from '../storage/database';

const execAsync = promisify(exec);

interface DependencyConflict {
  package: string;
  required: string;
  current: string;
  reason: string;
}

interface UpgradeResult {
  upgraded: string;
  from: string;
  to: string;
  peerDepsUpdated: Record<string, string>;
  conflicts: DependencyConflict[];
  breakingChanges: string[];
  installSuccess: boolean;
}

/**
 * Dependency Upgrade Agent - Automates package.json upgrades
 *
 * Responsibilities:
 * - Read and parse package.json
 * - Upgrade target framework version
 * - Resolve peer dependencies
 * - Detect version conflicts
 * - Update package.json safely
 * - Run npm install
 * - Validate successful installation
 */
export class DependencyUpgradeAgent extends BaseAgent {
  constructor(db?: DatabaseManager) {
    super(AgentType.DEPENDENCY_UPGRADE, db);
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    return this.executeWithTracking(context, async () => {
      const { config, session, data } = context;

      if (!config.application) {
        this.logger.info('No application configuration, skipping dependency upgrade');
        return this.success({ skipped: true });
      }

      const appPath = config.application.path;
      const framework = config.framework.name;
      const targetVersion = session.versions[session.versions.length - 1]; // Latest version

      try {
        this.logger.info(`Upgrading ${framework} to ${targetVersion} in ${appPath}`);

        // 1. Read current package.json
        const pkg = await this.readPackageJson(appPath);
        const currentVersion = pkg.dependencies?.[framework] || pkg.devDependencies?.[framework];

        if (!currentVersion) {
          throw new Error(`Framework ${framework} not found in package.json dependencies`);
        }

        this.logger.info(`Current version: ${currentVersion}, target: ${targetVersion}`);

        // 2. Get related packages that should be upgraded together
        const relatedPackages = getRelatedPackages(config.framework);
        const upgradeStrategy = getUpgradeStrategy(config.framework);

        this.logger.info(`Related packages to upgrade: ${relatedPackages.join(', ')}`);

        // 3. Get peer dependencies for target version
        const peerDeps = await this.resolvePeerDependencies(framework, targetVersion);

        // 4. For React frameworks, ensure react-dom is upgraded to matching version
        if (isReactFramework(config.framework) && framework === 'react') {
          if (pkg.dependencies?.['react-dom'] || pkg.devDependencies?.['react-dom']) {
            peerDeps['react-dom'] = targetVersion;
            this.logger.info(`Adding react-dom@${targetVersion} to upgrade list`);
          }
        }

        // 5. For React UI5, ensure base packages are compatible
        if (config.framework.name === '@ui5/webcomponents-react') {
          // ui5-webcomponents-react has specific peer dependency requirements
          const ui5PeerDeps = await this.resolvePeerDependencies('@ui5/webcomponents-react', targetVersion);
          Object.assign(peerDeps, ui5PeerDeps);
        }

        // 6. Detect conflicts
        const conflicts = await this.detectConflicts(pkg, peerDeps);

        if (conflicts.length > 0 && !config.upgrade?.resolveConflicts) {
          return this.failure(
            new Error(`Dependency conflicts detected: ${JSON.stringify(conflicts, null, 2)}`)
          );
        }

        // 7. Get breaking changes
        const breakingChanges = await this.getBreakingChanges(
          framework,
          currentVersion,
          targetVersion
        );

        // 8. Backup package.json
        await this.backupPackageJson(appPath);

        // 9. Update package.json - main framework
        if (pkg.dependencies?.[framework]) {
          pkg.dependencies[framework] = targetVersion;
        } else if (pkg.devDependencies?.[framework]) {
          pkg.devDependencies[framework] = targetVersion;
        }

        // Update related packages to matching versions
        for (const relatedPkg of relatedPackages) {
          if (pkg.dependencies?.[relatedPkg]) {
            pkg.dependencies[relatedPkg] = targetVersion;
            this.logger.info(`Upgraded ${relatedPkg} to ${targetVersion}`);
          } else if (pkg.devDependencies?.[relatedPkg]) {
            pkg.devDependencies[relatedPkg] = targetVersion;
            this.logger.info(`Upgraded ${relatedPkg} to ${targetVersion}`);
          }
        }

        // Update peer dependencies
        for (const [dep, version] of Object.entries(peerDeps)) {
          if (pkg.dependencies?.[dep]) {
            pkg.dependencies[dep] = version;
          } else if (pkg.devDependencies?.[dep]) {
            pkg.devDependencies[dep] = version;
          } else if (config.upgrade?.updatePeerDependencies) {
            pkg.dependencies = pkg.dependencies || {};
            pkg.dependencies[dep] = version;
          }
        }

        // Update TypeScript types for React if applicable
        if (upgradeStrategy.upgradeTypes && isReactFramework(config.framework)) {
          await this.upgradeReactTypes(pkg, targetVersion);
        }

        await this.writePackageJson(appPath, pkg);

        // 10. Run npm install
        let installSuccess = false;
        try {
          await this.runNpmInstall(appPath);
          installSuccess = true;
          this.logger.info('npm install completed successfully');
        } catch (error) {
          this.logger.error('npm install failed', error as Error);
          // Restore backup
          await this.restorePackageJson(appPath);
          throw error;
        }

        const result: UpgradeResult = {
          upgraded: framework,
          from: currentVersion,
          to: targetVersion,
          peerDepsUpdated: peerDeps,
          conflicts,
          breakingChanges,
          installSuccess,
        };

        this.logger.info('Dependency upgrade completed', result);

        return this.success(result);
      } catch (error) {
        return this.failure(error as Error);
      }
    });
  }

  private async readPackageJson(appPath: string): Promise<any> {
    const packageJsonPath = path.join(appPath, 'package.json');
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    return JSON.parse(content);
  }

  private async writePackageJson(appPath: string, pkg: any): Promise<void> {
    const packageJsonPath = path.join(appPath, 'package.json');
    await fs.writeFile(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
    this.logger.info('package.json updated');
  }

  private async backupPackageJson(appPath: string): Promise<void> {
    const packageJsonPath = path.join(appPath, 'package.json');
    const backupPath = path.join(appPath, 'package.json.pixeldust-backup');
    await fs.copyFile(packageJsonPath, backupPath);
    this.logger.info('package.json backed up');
  }

  private async restorePackageJson(appPath: string): Promise<void> {
    const packageJsonPath = path.join(appPath, 'package.json');
    const backupPath = path.join(appPath, 'package.json.pixeldust-backup');
    await fs.copyFile(backupPath, packageJsonPath);
    this.logger.info('package.json restored from backup');
  }

  private async resolvePeerDependencies(
    framework: string,
    version: string
  ): Promise<Record<string, string>> {
    this.logger.info(`Resolving peer dependencies for ${framework}@${version}`);

    try {
      const { stdout } = await execAsync(
        `npm view ${framework}@${version} peerDependencies --json`,
        { timeout: 30000 }
      );

      if (!stdout.trim()) {
        return {};
      }

      const peerDeps = JSON.parse(stdout);
      this.logger.info(`Found ${Object.keys(peerDeps).length} peer dependencies`);
      return peerDeps;
    } catch (error) {
      this.logger.warn('Could not resolve peer dependencies', error as Error);
      return {};
    }
  }

  private async detectConflicts(
    pkg: any,
    peerDeps: Record<string, string>
  ): Promise<DependencyConflict[]> {
    const conflicts: DependencyConflict[] = [];

    for (const [dep, requiredVersion] of Object.entries(peerDeps)) {
      const currentVersion =
        pkg.dependencies?.[dep] || pkg.devDependencies?.[dep];

      if (currentVersion && !this.isVersionCompatible(currentVersion, requiredVersion)) {
        conflicts.push({
          package: dep,
          required: requiredVersion,
          current: currentVersion,
          reason: `Peer dependency version mismatch`,
        });
      }
    }

    if (conflicts.length > 0) {
      this.logger.warn(`Found ${conflicts.length} dependency conflicts`, conflicts);
    }

    return conflicts;
  }

  private isVersionCompatible(current: string, required: string): boolean {
    // Simple version compatibility check
    // In production, use semver library for proper comparison
    const cleanCurrent = current.replace(/^[\^~]/, '');
    const cleanRequired = required.replace(/^[\^~]/, '');

    // Extract major version
    const currentMajor = parseInt(cleanCurrent.split('.')[0]);
    const requiredMajor = parseInt(cleanRequired.split('.')[0]);

    // Same major version is generally compatible
    return currentMajor === requiredMajor;
  }

  private async getBreakingChanges(
    framework: string,
    fromVersion: string,
    toVersion: string
  ): Promise<string[]> {
    // In production, fetch from framework's changelog or API
    // For now, return placeholder
    this.logger.info(`Checking breaking changes: ${fromVersion} → ${toVersion}`);

    const fromMajor = parseInt(fromVersion.split('.')[0]);
    const toMajor = parseInt(toVersion.split('.')[0]);

    if (toMajor > fromMajor) {
      return [
        `Major version upgrade: ${fromVersion} → ${toVersion}`,
        'Potential breaking changes - review migration guide',
      ];
    }

    return [];
  }

  private async runNpmInstall(appPath: string): Promise<void> {
    this.logger.info('Running npm install...');

    try {
      const { stdout, stderr } = await execAsync('npm install', {
        cwd: appPath,
        timeout: 300000, // 5 minutes
      });

      if (stderr && !stderr.includes('WARN')) {
        this.logger.warn(`npm install warnings: ${stderr}`);
      }

      this.logger.debug(`npm install output: ${stdout}`);
    } catch (error: any) {
      this.logger.error('npm install failed:', error.message);
      throw new Error(`npm install failed: ${error.message}`);
    }
  }

  private async upgradeReactTypes(pkg: any, reactVersion: string): Promise<void> {
    this.logger.info('Upgrading React TypeScript types');

    // Determine appropriate @types/react version based on React version
    const reactMajor = parseInt(reactVersion.split('.')[0]);
    let typesVersion = reactVersion;

    // @types/react versions typically match React versions
    // But for React 18+, we want ^18.0.0
    if (reactMajor >= 18) {
      typesVersion = `^${reactMajor}.0.0`;
    }

    // Update @types/react
    if (pkg.devDependencies?.['@types/react']) {
      pkg.devDependencies['@types/react'] = typesVersion;
      this.logger.info(`Updated @types/react to ${typesVersion}`);
    }

    // Update @types/react-dom
    if (pkg.devDependencies?.['@types/react-dom']) {
      pkg.devDependencies['@types/react-dom'] = typesVersion;
      this.logger.info(`Updated @types/react-dom to ${typesVersion}`);
    }

    // For React 18+, ensure @types/react-dom/client is available
    if (reactMajor >= 18 && pkg.devDependencies?.['@types/react']) {
      // Types are included in @types/react-dom for React 18+
      this.logger.info('React 18+ types include client APIs');
    }
  }
}

export default DependencyUpgradeAgent;
