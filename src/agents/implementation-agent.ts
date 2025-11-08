import { BaseAgent } from './base-agent';
import {
  AgentType,
  AgentContext,
  AgentResult,
  Implementation,
  RemediationStatus,
} from '../types';
import simpleGit, { SimpleGit } from 'simple-git';
import fs from 'fs/promises';
import path from 'path';

/**
 * Implementation Agent - Applies approved fixes
 *
 * Responsibilities:
 * - Apply code changes
 * - Manage Git branches
 * - Dependency updates
 * - Configuration changes
 * - Automated testing of fixes
 */
export class ImplementationAgent extends BaseAgent {
  private git: SimpleGit;

  constructor() {
    super(AgentType.IMPLEMENTATION);
    this.git = simpleGit();
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const { session, data } = context;
    const remediations = data?.remediations || [];

    try {
      this.logger.info('Implementing approved remediations');

      const implementations: Implementation[] = [];

      // Filter approved remediations
      const approvedRemediations = remediations.filter(
        (r: any) => r.status === RemediationStatus.APPROVED
      );

      if (approvedRemediations.length === 0) {
        this.logger.info('No approved remediations to implement');
        return this.success({ message: 'No approved remediations' });
      }

      for (const remediation of approvedRemediations) {
        this.logger.info(`Implementing remediation ${remediation.id}`);

        const implementation = await this.implementRemediation(
          remediation,
          session.id
        );

        implementations.push(implementation);
      }

      this.logger.info(`Implemented ${implementations.length} remediations`);

      return this.success({
        implementations,
      });
    } catch (error) {
      return this.failure(error as Error);
    }
  }

  private async implementRemediation(
    remediation: any,
    sessionId: string
  ): Promise<Implementation> {
    const solution = remediation.proposal.solutions.find(
      (s: any) => s.id === remediation.proposal.recommendedSolution
    );

    if (!solution) {
      throw new Error('Recommended solution not found');
    }

    // Create a new branch for this remediation
    const branchName = `pixeldust/${sessionId}/${remediation.id}`;

    try {
      // Create and checkout branch
      await this.git.checkoutBranch(branchName, 'main');

      // Apply code changes
      const appliedChanges = await this.applyCodeChanges(solution.codeChanges || []);

      // Commit changes
      await this.git.add('.');
      const commitResult = await this.git.commit(
        `[PixelDust] ${remediation.proposal.title}\n\n${remediation.proposal.description}`
      );

      const implementation: Implementation = {
        solutionId: solution.id,
        appliedChanges,
        commitHash: commitResult.commit,
        branchName,
        implementedAt: new Date(),
      };

      this.logger.info(`Remediation implemented on branch ${branchName}`);

      return implementation;
    } catch (error) {
      this.logger.error('Failed to implement remediation', error as Error);
      // Try to cleanup
      try {
        await this.git.checkout('main');
        await this.git.deleteLocalBranch(branchName, true);
      } catch {}
      throw error;
    }
  }

  private async applyCodeChanges(codeChanges: any[]): Promise<any[]> {
    const appliedChanges = [];

    for (const change of codeChanges) {
      try {
        const filePath = path.join(process.cwd(), change.filePath);

        switch (change.changeType) {
          case 'add':
            await fs.writeFile(filePath, change.after);
            appliedChanges.push(change);
            break;

          case 'modify':
            const content = await fs.readFile(filePath, 'utf-8');
            const updatedContent = content.replace(change.before, change.after);
            await fs.writeFile(filePath, updatedContent);
            appliedChanges.push(change);
            break;

          case 'delete':
            await fs.unlink(filePath);
            appliedChanges.push(change);
            break;
        }

        this.logger.info(`Applied ${change.changeType} to ${change.filePath}`);
      } catch (error) {
        this.logger.error(`Failed to apply change to ${change.filePath}`, error as Error);
      }
    }

    return appliedChanges;
  }

  async rollback(branchName: string): Promise<void> {
    this.logger.info(`Rolling back branch ${branchName}`);

    try {
      await this.git.checkout('main');
      await this.git.deleteLocalBranch(branchName, true);
      this.logger.info('Rollback completed');
    } catch (error) {
      this.logger.error('Rollback failed', error as Error);
      throw error;
    }
  }
}

export default ImplementationAgent;
