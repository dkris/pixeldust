import { BaseAgent } from './base-agent';
import { AgentType, AgentContext, AgentResult } from '../types';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

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
  constructor() {
    super(AgentType.DEPENDENCY_UPGRADE);
  }

  async execute(context: AgentContext): Promise<AgentResult> {
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

      // 2. Get peer dependencies for target version
      const peerDeps = await this.resolvePeerDependencies(framework, targetVersion);

      // 3. Detect conflicts
      const conflicts = await this.detectConflicts(pkg, peerDeps);

      if (conflicts.length > 0 && !config.upgrade?.resolveConflicts) {
        return this.failure(
          new Error(`Dependency conflicts detected: ${JSON.stringify(conflicts, null, 2)}`)
        );
      }

      // 4. Get breaking changes
      const breakingChanges = await this.getBreakingChanges(
        framework,
        currentVersion,
        targetVersion
      );

      // 5. Backup package.json
      await this.backupPackageJson(appPath);

      // 6. Update package.json
      if (pkg.dependencies?.[framework]) {
        pkg.dependencies[framework] = targetVersion;
      } else if (pkg.devDependencies?.[framework]) {
        pkg.devDependencies[framework] = targetVersion;
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

      await this.writePackageJson(appPath, pkg);

      // 7. Run npm install
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
}

export default DependencyUpgradeAgent;
