import { BaseAgent } from './base-agent';
import { AgentType, AgentContext, AgentResult } from '../types';
import Anthropic from '@anthropic-ai/sdk';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const execAsync = promisify(exec);

interface TestFailure {
  filePath: string;
  testName: string;
  error: string;
  stackTrace: string;
}

interface TestFix {
  filePath: string;
  testName: string;
  analysis: string;
  changes: CodeChange[];
  confidence: number;
}

interface CodeChange {
  type: 'import' | 'assertion' | 'setup' | 'API' | 'selector' | 'other';
  before: string;
  after: string;
  reason: string;
  lineNumber?: number;
}

interface TestResults {
  total: number;
  passed: number;
  failed: number;
  failures: TestFailure[];
  allPassed: boolean;
}

/**
 * Test Fixing Agent - AI-powered test fixing after framework upgrades
 *
 * Responsibilities:
 * - Run existing test suite
 * - Parse test failures
 * - Use AI to analyze failures in context of framework changes
 * - Generate fixes for broken tests
 * - Apply fixes to test files
 * - Re-run tests to verify fixes
 * - Iterate until all tests pass or max attempts reached
 */
export class TestFixingAgent extends BaseAgent {
  private ai: Anthropic;
  private maxIterations = 3;

  constructor() {
    super(AgentType.TEST_FIXING);
    this.ai = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const { config, session, data } = context;

    if (!config.application) {
      this.logger.info('No application configuration, skipping test fixing');
      return this.success({ skipped: true });
    }

    if (!config.upgrade?.fixTests) {
      this.logger.info('Test fixing disabled in configuration');
      return this.success({ skipped: true, reason: 'disabled' });
    }

    const appPath = config.application.path;
    const testCommand = config.application.testCommand || 'npm test';

    try {
      this.logger.info('Starting test fixing process');

      let iteration = 0;
      let allFixed = false;
      const allFixes: TestFix[] = [];

      while (iteration < this.maxIterations && !allFixed) {
        iteration++;
        this.logger.info(`Test fixing iteration ${iteration}/${this.maxIterations}`);

        // 1. Run tests
        const testResults = await this.runTests(appPath, testCommand);

        if (testResults.allPassed) {
          this.logger.info('All tests passing!');
          allFixed = true;
          break;
        }

        this.logger.info(
          `Found ${testResults.failed} failing tests (${testResults.passed} passing)`
        );

        // 2. Generate fixes for each failure
        const fixes = await this.generateFixes(testResults.failures, context);
        allFixes.push(...fixes);

        // 3. Apply fixes
        for (const fix of fixes) {
          await this.applyFix(fix, appPath);
        }

        this.logger.info(`Applied ${fixes.length} fixes, re-running tests...`);
      }

      // Final test run
      const finalResults = await this.runTests(appPath, testCommand);

      return this.success({
        iterations: iteration,
        totalFixes: allFixes.length,
        finalResults: {
          total: finalResults.total,
          passed: finalResults.passed,
          failed: finalResults.failed,
          allPassed: finalResults.allPassed,
        },
        fixes: allFixes,
      });
    } catch (error) {
      return this.failure(error as Error);
    }
  }

  private async runTests(appPath: string, testCommand: string): Promise<TestResults> {
    this.logger.info(`Running tests: ${testCommand}`);

    try {
      const { stdout, stderr } = await execAsync(testCommand, {
        cwd: appPath,
        timeout: 300000, // 5 minutes
      });

      return this.parseTestResults(stdout, stderr, null);
    } catch (error: any) {
      // Tests failed, parse the output
      return this.parseTestResults(error.stdout || '', error.stderr || '', error);
    }
  }

  private parseTestResults(stdout: string, stderr: string, error: any): TestResults {
    const failures: TestFailure[] = [];
    let total = 0;
    let passed = 0;
    let failed = 0;

    // Parse Jest/Vitest output
    const jestPattern = /Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/;
    const match = stdout.match(jestPattern) || stderr.match(jestPattern);

    if (match) {
      failed = parseInt(match[1]);
      passed = parseInt(match[2]);
      total = parseInt(match[3]);
    }

    // Parse individual failures
    const failurePattern = /●\s+(.+?)\n\n\s+(.+?)\n\n\s+(.+?)(?=\n\n|$)/gs;
    let failureMatch;

    const combinedOutput = stdout + '\n' + stderr;

    while ((failureMatch = failurePattern.exec(combinedOutput)) !== null) {
      failures.push({
        filePath: this.extractFilePath(failureMatch[0]),
        testName: failureMatch[1].trim(),
        error: failureMatch[2].trim(),
        stackTrace: failureMatch[3].trim(),
      });
    }

    return {
      total,
      passed,
      failed,
      failures,
      allPassed: failed === 0,
    };
  }

  private extractFilePath(failureText: string): string {
    const pathPattern = /at\s+(.+?):(\d+):(\d+)/;
    const match = failureText.match(pathPattern);
    return match ? match[1] : 'unknown';
  }

  private async generateFixes(
    failures: TestFailure[],
    context: AgentContext
  ): Promise<TestFix[]> {
    const fixes: TestFix[] = [];

    for (const failure of failures.slice(0, 10)) {
      // Limit to 10 at a time
      try {
        const fix = await this.generateTestFix(failure, context);
        fixes.push(fix);
      } catch (error) {
        this.logger.error(`Failed to generate fix for ${failure.testName}`, error as Error);
      }
    }

    return fixes;
  }

  private async generateTestFix(
    failure: TestFailure,
    context: AgentContext
  ): Promise<TestFix> {
    this.logger.info(`Generating fix for: ${failure.testName}`);

    if (!context.config.application) {
      throw new Error('Application configuration is required for test fixing');
    }

    // Read test file
    const testCode = await this.readTestFile(failure.filePath, context.config.application.path);

    // Get migration guide
    const migrationGuide = await this.getMigrationGuide(context);

    const prompt = `You are an expert at fixing tests after framework upgrades.

Framework: ${context.config.framework.name}
Upgrade: ${context.session.versions[0]} → ${context.session.versions[context.session.versions.length - 1]}

Test file: ${failure.filePath}
Failing test: ${failure.testName}

Test code:
\`\`\`typescript
${testCode}
\`\`\`

Error:
\`\`\`
${failure.error}
\`\`\`

Stack trace:
\`\`\`
${failure.stackTrace}
\`\`\`

Migration context:
${migrationGuide}

Analyze this test failure and generate a fix. Common causes after framework upgrades:
1. API changes (methods renamed, removed, or signature changed)
2. CSS class name changes
3. Import path changes
4. Event handler changes
5. DOM structure changes
6. Selector changes

Return a JSON object with this structure:
{
  "analysis": "Brief explanation of why the test is failing",
  "changes": [
    {
      "type": "import|assertion|setup|API|selector|other",
      "before": "exact code that needs to change",
      "after": "corrected code",
      "reason": "why this change is needed"
    }
  ],
  "confidence": 0.0-1.0
}

Focus on the most likely cause based on the error message. Be specific with code changes.`;

    try {
      const response = await this.ai.messages.create({
        model: context.config.ai.model || 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        temperature: 0.3, // Lower temperature for more focused fixes
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from AI');
      }

      // Parse JSON from response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Could not extract JSON from AI response');
      }

      const fixData = JSON.parse(jsonMatch[0]);

      return {
        filePath: failure.filePath,
        testName: failure.testName,
        analysis: fixData.analysis,
        changes: fixData.changes,
        confidence: fixData.confidence,
      };
    } catch (error) {
      this.logger.error('Failed to generate AI fix', error as Error);
      throw error;
    }
  }

  private async readTestFile(filePath: string, appPath: string): Promise<string> {
    try {
      const fullPath = path.isAbsolute(filePath) ? filePath : path.join(appPath, filePath);
      return await fs.readFile(fullPath, 'utf-8');
    } catch (error) {
      this.logger.warn(`Could not read test file: ${filePath}`);
      return '// Could not read test file';
    }
  }

  private async getMigrationGuide(context: AgentContext): Promise<string> {
    // In production, fetch from framework's changelog or migration guide
    const framework = context.config.framework.name;
    const versions = context.session.versions;

    return `
Migration from ${versions[0]} to ${versions[versions.length - 1]}:
- Check for API changes in ${framework} documentation
- Common breaking changes in major version upgrades:
  * Component prop renames
  * Event handler signature changes
  * CSS class name updates
  * Import path changes
`;
  }

  private async applyFix(fix: TestFix, appPath: string): Promise<void> {
    this.logger.info(`Applying fix to ${fix.testName} (confidence: ${fix.confidence})`);

    if (fix.confidence < 0.5) {
      this.logger.warn(`Low confidence fix (${fix.confidence}), skipping`);
      return;
    }

    const fullPath = path.isAbsolute(fix.filePath)
      ? fix.filePath
      : path.join(appPath, fix.filePath);

    try {
      let content = await fs.readFile(fullPath, 'utf-8');

      // Apply each change
      for (const change of fix.changes) {
        if (content.includes(change.before)) {
          content = content.replace(change.before, change.after);
          this.logger.info(`Applied ${change.type} change: ${change.reason}`);
        } else {
          this.logger.warn(`Could not find code to replace: ${change.before.substring(0, 50)}...`);
        }
      }

      // Write back
      await fs.writeFile(fullPath, content, 'utf-8');
      this.logger.info(`Updated ${fix.filePath}`);
    } catch (error) {
      this.logger.error(`Failed to apply fix to ${fix.filePath}`, error as Error);
      throw error;
    }
  }
}

export default TestFixingAgent;
