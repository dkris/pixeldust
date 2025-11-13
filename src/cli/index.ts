#!/usr/bin/env node

import { Command } from 'commander';
import { v4 as uuidv4 } from 'uuid';
import ora from 'ora';
import open from 'open';
import { ConfigLoader } from '../core/config-loader';
import { DatabaseManager } from '../storage/database';
import { OrchestratorAgent } from '../agents/orchestrator-agent';
import { WorkflowDiscoveryAgent } from '../agents/workflow-discovery-agent';
import { Session, SessionState, Config } from '../types';
import { ReportGenerator } from '../core/report-generator';
import { WebServer } from '../web/server';
import { WorkflowReporter } from '../utils/workflow-reporter';
import Logger from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';

const program = new Command();
const logger = new Logger('CLI');

program
  .name('pixeldust')
  .description('Agentic AI system for automated UI version testing and remediation')
  .version('0.2.0');

// ============================================================================
// Init Command
// ============================================================================

program
  .command('init')
  .description('Initialize a new PixelDust configuration')
  .option('-f, --force', 'Overwrite existing configuration')
  .action(async (options) => {
    const spinner = ora('Initializing PixelDust configuration').start();

    try {
      const configPath = path.join(process.cwd(), '.pixeldustrc.json');

      // Check if config already exists
      try {
        await fs.access(configPath);
        if (!options.force) {
          spinner.fail('Configuration already exists. Use --force to overwrite.');
          return;
        }
      } catch {}

      // Create default configuration
      const defaultConfig = ConfigLoader.getDefaultConfig();
      await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));

      spinner.succeed('Configuration file created: .pixeldustrc.json');
      console.log('\nNext steps:');
      console.log('  1. Edit .pixeldustrc.json to customize your setup');
      console.log('  2. Run "pixeldust test" to start testing');
    } catch (error) {
      spinner.fail('Failed to initialize configuration');
      logger.error('Init failed', error as Error);
      process.exit(1);
    }
  });

// ============================================================================
// Test Command
// ============================================================================

program
  .command('test')
  .description('Run UI version testing')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('-v, --versions <versions>', 'Comma-separated list of versions to test')
  .option('--skip-browser-check', 'Skip Playwright browser installation check')
  .action(async (options) => {
    const spinner = ora('Loading configuration').start();

    try {
      // Load configuration
      const configLoader = new ConfigLoader();
      const config: Config = await configLoader.load(options.config);

      // Check if Playwright browsers are installed (unless skipped)
      if (!options.skipBrowserCheck) {
        spinner.text = 'Checking Playwright browsers';
        const browsersInstalled = await checkPlaywrightBrowsers(config.testing.browsers);
        if (!browsersInstalled) {
          spinner.fail('Playwright browsers not found');
          console.log('\n⚠️  Playwright browsers are not installed.\n');
          console.log('Please run one of the following commands:\n');
          console.log('  1. Install Chromium only (recommended):');
          console.log('     npx playwright install chromium\n');
          console.log('  2. Install all browsers:');
          console.log('     npx playwright install\n');
          console.log('  3. Skip this check (not recommended):');
          console.log('     pixeldust test --skip-browser-check\n');
          process.exit(1);
        }
      }

      // Override versions if provided
      if (options.versions) {
        config.framework.versions = options.versions.split(',').map((v: string) => v.trim());
      }

      spinner.succeed('Configuration loaded');

      // Create session
      const session: Session = {
        id: uuidv4(),
        state: SessionState.IDLE,
        config,
        versions: config.framework.versions,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Initialize database
      const db = new DatabaseManager();

      // Create orchestrator
      const orchestrator = new OrchestratorAgent(db);

      spinner.start('Starting testing session');
      logger.info(`Session ID: ${session.id}`);

      // Execute state machine
      await runStateMachine(orchestrator, session, config, db, spinner);

      db.close();
    } catch (error) {
      spinner.fail('Testing failed');
      logger.error('Test command failed', error as Error);
      process.exit(1);
    }
  });

// ============================================================================
// Resume Command
// ============================================================================

program
  .command('resume <session-id>')
  .description('Resume a previous testing session')
  .action(async (sessionId) => {
    const spinner = ora('Resuming session').start();

    try {
      const db = new DatabaseManager();
      const session = db.getSession(sessionId);

      if (!session) {
        spinner.fail(`Session ${sessionId} not found`);
        return;
      }

      spinner.succeed(`Resumed session ${sessionId}`);
      logger.info(`Current state: ${session.state}`);

      const orchestrator = new OrchestratorAgent(db);
      await runStateMachine(orchestrator, session, session.config, db, spinner);

      db.close();
    } catch (error) {
      spinner.fail('Failed to resume session');
      logger.error('Resume failed', error as Error);
      process.exit(1);
    }
  });

// ============================================================================
// Report Command
// ============================================================================

program
  .command('report <session-id>')
  .description('Generate report for a session')
  .option('-f, --format <format>', 'Report format (markdown, html, json)', 'markdown')
  .action(async (sessionId, options) => {
    const spinner = ora('Generating report').start();

    try {
      const db = new DatabaseManager();
      const session = db.getSession(sessionId);

      if (!session) {
        spinner.fail(`Session ${sessionId} not found`);
        return;
      }

      const reportGen = new ReportGenerator(db);
      const reportPath = await reportGen.generate(
        session,
        options.format
      );

      spinner.succeed(`Report generated: ${reportPath}`);
      db.close();
    } catch (error) {
      spinner.fail('Failed to generate report');
      logger.error('Report generation failed', error as Error);
      process.exit(1);
    }
  });

// ============================================================================
// List Command
// ============================================================================

program
  .command('list')
  .description('List all testing sessions')
  .option('-n, --limit <number>', 'Number of sessions to show', '10')
  .action(async (options) => {
    try {
      const db = new DatabaseManager();
      const sessions = db.listSessions(parseInt(options.limit));

      console.log('\nRecent Sessions:\n');
      console.log('ID                                   | State              | Versions | Created');
      console.log('-'.repeat(100));

      for (const session of sessions) {
        const id = session.id.substring(0, 36).padEnd(36);
        const state = session.state.padEnd(18);
        const versions = session.versions.join(', ').substring(0, 8);
        const created = session.createdAt.toISOString().split('T')[0];

        console.log(`${id} | ${state} | ${versions} | ${created}`);
      }

      db.close();
    } catch (error) {
      logger.error('List command failed', error as Error);
      process.exit(1);
    }
  });

// ============================================================================
// Show Tests Command
// ============================================================================

program
  .command('show-tests <session-id>')
  .description('Show generated Playwright tests')
  .option('-c, --component <component>', 'Filter by component name')
  .option('-e, --export <path>', 'Export tests to directory')
  .action(async (sessionId, options) => {
    try {
      const db = new DatabaseManager();
      const session = db.getSession(sessionId);

      if (!session) {
        console.error(`Session ${sessionId} not found`);
        return;
      }

      const testSuites = db.getTestSuites(sessionId);

      if (testSuites.length === 0) {
        console.log('No tests found for this session.');
        console.log('Tests are generated during the TEST_GENERATION phase.');
        return;
      }

      // Filter by component if specified
      const filteredSuites = options.component
        ? testSuites.filter(s => s.component === options.component)
        : testSuites;

      if (filteredSuites.length === 0) {
        console.log(`No tests found for component: ${options.component}`);
        return;
      }

      // Export to files if path specified
      if (options.export) {
        const exportPath = path.resolve(options.export);
        await fs.mkdir(exportPath, { recursive: true });

        for (const suite of filteredSuites) {
          const componentDir = path.join(exportPath, suite.component);
          await fs.mkdir(componentDir, { recursive: true });

          for (let i = 0; i < suite.tests.length; i++) {
            const test = suite.tests[i];
            const filename = `${test.category.toLowerCase()}-${i + 1}.spec.ts`;
            const filepath = path.join(componentDir, filename);

            const content = `// ${test.name}
// ${test.description}
// Generated at: ${suite.generatedAt}

${test.code}
`;

            await fs.writeFile(filepath, content);
          }

          console.log(`✓ Exported ${suite.tests.length} tests for ${suite.component} to ${componentDir}`);
        }

        console.log(`\nAll tests exported to: ${exportPath}`);
      } else {
        // Display to console
        console.log(`\nGenerated Tests for Session: ${sessionId}\n`);
        console.log('='.repeat(80) + '\n');

        for (const suite of filteredSuites) {
          console.log(`Component: ${suite.component}`);
          console.log(`Generated: ${suite.generatedAt}`);
          console.log(`Tests: ${suite.tests.length}\n`);

          for (let i = 0; i < suite.tests.length; i++) {
            const test = suite.tests[i];
            console.log(`  ${i + 1}. ${test.name} [${test.category}]`);
            console.log(`     ${test.description}\n`);
          }

          console.log('-'.repeat(80) + '\n');
        }

        console.log(`\nTo export these tests to files, run:`);
        console.log(`  pixeldust show-tests ${sessionId} --export ./playwright-tests\n`);
      }

      db.close();
    } catch (error) {
      logger.error('Show tests command failed', error as Error);
      process.exit(1);
    }
  });

// ============================================================================
// Approve Command
// ============================================================================

program
  .command('approve <session-id> <remediation-id>')
  .description('Approve a remediation proposal')
  .action(async (sessionId, remediationId) => {
    const spinner = ora('Approving remediation').start();

    try {
      const db = new DatabaseManager();
      const orchestrator = new OrchestratorAgent(db);

      await orchestrator.approveRemediation(sessionId, remediationId);

      spinner.succeed('Remediation approved');

      // Continue execution
      const session = db.getSession(sessionId);
      if (session) {
        await runStateMachine(orchestrator, session, session.config, db, spinner);
      }

      db.close();
    } catch (error) {
      spinner.fail('Failed to approve remediation');
      logger.error('Approve failed', error as Error);
      process.exit(1);
    }
  });

// ============================================================================
// Show Evaluation Command
// ============================================================================

program
  .command('show-evaluation <session-id>')
  .description('Show evaluation feedback and recommendations')
  .action(async (sessionId) => {
    try {
      const db = new DatabaseManager();
      const session = db.getSession(sessionId);

      if (!session) {
        console.error(`Session ${sessionId} not found`);
        return;
      }

      const evaluations = db.getEvaluations(sessionId);

      if (evaluations.length === 0) {
        console.log('No evaluations found for this session.');
        console.log('Evaluations are generated after the testing session completes.');
        return;
      }

      const latestEval = evaluations[0]; // Already sorted by timestamp DESC

      console.log(`\n${'='.repeat(80)}`);
      console.log(`Evaluation Report for Session: ${sessionId}`);
      console.log(`Generated: ${latestEval.timestamp.toISOString()}`);
      console.log(`${'='.repeat(80)}\n`);

      // Overall Score
      console.log(`Overall Score: ${latestEval.metrics.overallScore.toFixed(2)}/100\n`);

      // Test Quality Metrics
      console.log('Test Quality:');
      console.log(`  Total Tests: ${latestEval.metrics.testQuality.totalTests}`);
      console.log(`  Success Rate: ${(latestEval.metrics.testQuality.successRate * 100).toFixed(2)}%`);
      console.log(`  Coverage Score: ${latestEval.metrics.testQuality.coverageScore.toFixed(2)}/100`);
      console.log(`  Avg Duration: ${latestEval.metrics.testQuality.averageTestDuration.toFixed(0)}ms\n`);

      // Comparison Quality Metrics
      console.log('Comparison Quality:');
      console.log(`  Total Comparisons: ${latestEval.metrics.comparisonQuality.totalComparisons}`);
      console.log(`  Detected Differences: ${latestEval.metrics.comparisonQuality.detectedDifferences}`);
      console.log(`  Precision: ${(latestEval.metrics.comparisonQuality.precision * 100).toFixed(2)}%`);
      console.log(`  Recall: ${(latestEval.metrics.comparisonQuality.recall * 100).toFixed(2)}%`);
      console.log(`  Accuracy: ${latestEval.metrics.comparisonQuality.accuracyScore.toFixed(2)}/100\n`);

      // Remediation Effectiveness (if applicable)
      if (latestEval.metrics.remediationEffectiveness) {
        console.log('Remediation Effectiveness:');
        console.log(`  Total Remediations: ${latestEval.metrics.remediationEffectiveness.totalRemediations}`);
        console.log(`  Success Rate: ${(latestEval.metrics.remediationEffectiveness.successRate * 100).toFixed(2)}%`);
        console.log(`  Avg Confidence: ${(latestEval.metrics.remediationEffectiveness.averageConfidence * 100).toFixed(2)}%\n`);
      }

      // Strengths
      if (latestEval.feedback.strengths.length > 0) {
        console.log('Strengths:');
        latestEval.feedback.strengths.forEach((strength: string) => {
          console.log(`  ✓ ${strength}`);
        });
        console.log('');
      }

      // Weaknesses
      if (latestEval.feedback.weaknesses.length > 0) {
        console.log('Weaknesses:');
        latestEval.feedback.weaknesses.forEach((weakness: string) => {
          console.log(`  ✗ ${weakness}`);
        });
        console.log('');
      }

      // Recommendations
      if (latestEval.feedback.recommendations.length > 0) {
        console.log('Recommendations:');
        latestEval.feedback.recommendations.forEach((rec: any, index: number) => {
          const priorityIcon = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
          const actionableIcon = rec.actionable ? '✅' : '❌';
          console.log(`\n  ${index + 1}. ${priorityIcon} [${rec.priority.toUpperCase()}] ${rec.title}`);
          console.log(`     Category: ${rec.category}`);
          console.log(`     Impact: ${rec.estimatedImpact}`);
          console.log(`     Actionable: ${actionableIcon}`);
          console.log(`     ${rec.description}`);
        });
        console.log('');
      }

      // Prompt Improvements
      if (latestEval.feedback.promptImprovements && latestEval.feedback.promptImprovements.length > 0) {
        console.log('\nPrompt Improvements:');
        latestEval.feedback.promptImprovements.forEach((improvement: any, index: number) => {
          console.log(`\n  ${index + 1}. ${improvement.agentType} (Confidence: ${(improvement.confidence * 100).toFixed(0)}%)`);
          console.log(`     Issue: ${improvement.currentIssue}`);
          console.log(`     Suggested Change: ${improvement.suggestedChange}`);
          console.log(`     Expected Improvement: ${improvement.expectedImprovement}`);
        });
        console.log('');
      }

      // Config Suggestions
      if (latestEval.feedback.configSuggestions && latestEval.feedback.configSuggestions.length > 0) {
        console.log('\nConfiguration Suggestions:');
        latestEval.feedback.configSuggestions.forEach((suggestion: any, index: number) => {
          const impactIcon = suggestion.impact === 'high' ? '🔴' : suggestion.impact === 'medium' ? '🟡' : '🟢';
          console.log(`\n  ${index + 1}. ${impactIcon} ${suggestion.configPath}`);
          console.log(`     Current: ${JSON.stringify(suggestion.currentValue)}`);
          console.log(`     Suggested: ${JSON.stringify(suggestion.suggestedValue)}`);
          console.log(`     Rationale: ${suggestion.rationale}`);
        });
        console.log('');
      }

      console.log(`${'='.repeat(80)}\n`);

      db.close();
    } catch (error) {
      logger.error('Show evaluation command failed', error as Error);
      process.exit(1);
    }
  });

// ============================================================================
// Show Diff Command
// ============================================================================

program
  .command('show-diff <session-id>')
  .description('Open interactive diff viewer in browser')
  .option('-p, --port <port>', 'Port to run web server on', '3000')
  .option('--no-open', 'Do not open browser automatically')
  .action(async (sessionId, options) => {
    const spinner = ora('Starting diff viewer').start();

    try {
      const db = new DatabaseManager();
      const session = db.getSession(sessionId);

      if (!session) {
        spinner.fail(`Session ${sessionId} not found`);
        process.exit(1);
      }

      const port = parseInt(options.port, 10);
      const webServer = new WebServer(db, port);

      spinner.text = `Starting web server on port ${port}`;

      await webServer.start();

      const url = `http://localhost:${port}/?session=${sessionId}`;

      spinner.succeed(`Diff viewer started at ${url}`);

      console.log(`\n📊 PixelDust Diff Viewer`);
      console.log(`${'='.repeat(50)}`);
      console.log(`Session: ${sessionId}`);
      console.log(`URL: ${url}`);
      console.log(`\nPress Ctrl+C to stop the server\n`);

      // Open browser if not disabled
      if (options.open !== false) {
        try {
          await open(url);
          console.log('✓ Opened browser automatically\n');
        } catch (error) {
          console.log('⚠ Could not open browser automatically. Please open the URL manually.\n');
        }
      }

      // Keep the server running
      process.on('SIGINT', async () => {
        console.log('\n\nShutting down web server...');
        await webServer.stop();
        db.close();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        await webServer.stop();
        db.close();
        process.exit(0);
      });

      // Keep process alive
      await new Promise(() => {});
    } catch (error: any) {
      spinner.fail('Failed to start diff viewer');

      if (error.message && error.message.includes('already in use')) {
        console.error(`\n❌ Port ${options.port} is already in use.`);
        console.error(`   Try using a different port: pixeldust show-diff ${sessionId} --port 3001\n`);
      } else {
        logger.error('Show diff command failed', error as Error);
      }

      process.exit(1);
    }
  });

// ============================================================================
// Discover Workflows Command
// ============================================================================

program
  .command('discover-workflows')
  .description('Discover and document application workflows')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('-u, --url <url>', 'Application URL (overrides config)')
  .option('-o, --output <path>', 'Output file path', './workflow-documentation.md')
  .option('-f, --format <format>', 'Output format (markdown, json, html)', 'markdown')
  .option('--max-depth <number>', 'Maximum crawl depth', '3')
  .option('--max-pages <number>', 'Maximum pages to crawl', '50')
  .option('--no-screenshots', 'Skip taking screenshots')
  .action(async (options) => {
    const spinner = ora('Starting workflow discovery').start();

    try {
      let config: Config;
      let applicationUrl: string;

      // Load config if provided
      if (options.config) {
        spinner.text = 'Loading configuration';
        const configLoader = new ConfigLoader();
        config = await configLoader.load(options.config);

        if (!config.application) {
          spinner.fail('Configuration must include application settings for workflow discovery');
          console.log('\nWorkflow discovery requires an application to crawl.');
          console.log('Please add an application section to your config:\n');
          console.log(JSON.stringify({
            application: {
              path: './path/to/your/app',
              url: 'http://localhost:3000',
              port: 3000,
            }
          }, null, 2));
          process.exit(1);
        }

        applicationUrl = options.url || `http://localhost:${config.application.port}`;
      } else if (options.url) {
        // Minimal config with just URL
        applicationUrl = options.url;
        const urlObj = new URL(applicationUrl);
        const port = urlObj.port ? parseInt(urlObj.port, 10) : (urlObj.protocol === 'https:' ? 443 : 80);

        config = {
          framework: {
            name: 'react',
            versions: ['latest'],
          },
          components: {
            include: [],
            exclude: [],
          },
          containers: {
            runtime: 'docker',
            baseImage: 'node:18-alpine',
            resources: {
              memory: '2g',
              cpu: 2,
            },
          },
          application: {
            path: process.cwd(),
            buildCommand: 'npm run build',
            startCommand: 'npm start',
            port: port,
          },
          testing: {
            browsers: ['chromium'],
            viewport: {
              width: 1920,
              height: 1080,
            },
            timeout: 30000,
            retries: 0,
            headless: true,
          },
          analysis: {
            visualThreshold: 0.1,
            domIgnoreAttributes: [],
            performanceThresholds: {
              fcp: 1800,
              lcp: 2500,
              tti: 3800,
            },
          },
          ai: {
            provider: 'anthropic',
            model: 'claude-sonnet-4-5-20250929',
            temperature: 0.7,
            maxTokens: 4096,
          },
          storage: {
            type: 'local',
            path: './data',
          },
          reporting: {
            format: ['markdown'],
            outputPath: './reports',
          },
        } as Config;
      } else {
        spinner.fail('Either --config or --url must be provided');
        console.log('\nUsage:');
        console.log('  pixeldust discover-workflows --config .pixeldustrc.json');
        console.log('  pixeldust discover-workflows --url http://localhost:3000\n');
        process.exit(1);
      }

      // Create session for workflow discovery
      const session: Session = {
        id: uuidv4(),
        state: SessionState.WORKFLOW_DISCOVERY,
        config,
        versions: config.framework.versions,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      spinner.text = `Discovering workflows from ${applicationUrl}`;
      logger.info(`Starting workflow discovery for ${applicationUrl}`);

      // Run workflow discovery
      const workflowAgent = new WorkflowDiscoveryAgent();
      const result = await workflowAgent.execute({
        session,
        config,
        data: {
          containers: [{
            url: applicationUrl,
            version: 'current',
            containerId: 'standalone',
            port: new URL(applicationUrl).port ? parseInt(new URL(applicationUrl).port, 10) : 80,
          }],
        },
      });

      if (!result.success) {
        throw result.error || new Error('Workflow discovery failed');
      }

      spinner.text = 'Generating documentation';

      // Generate report
      const reporter = new WorkflowReporter();
      const reportPath = await reporter.generateReport(
        result.data,
        options.output,
        options.format
      );

      spinner.succeed(`Workflow documentation generated: ${reportPath}`);

      // Display summary
      console.log(`\n📊 Discovery Summary:`);
      console.log(`   Application: ${applicationUrl}`);
      console.log(`   Pages Discovered: ${result.data.pages.length}`);
      console.log(`   Workflows Identified: ${result.data.workflows.length}`);
      console.log(`   Components Found: ${result.data.componentUsage.length}`);
      console.log(`   Format: ${options.format}`);
      console.log(`   Output: ${reportPath}`);

      // Show top components
      if (result.data.componentUsage.length > 0) {
        console.log(`\n🎯 Top Components:`);
        const topComponents = result.data.componentUsage
          .sort((a: any, b: any) => b.count - a.count)
          .slice(0, 5);

        topComponents.forEach((comp: any) => {
          console.log(`   ${comp.tag} - used ${comp.count} time(s) across ${comp.pages.length} page(s)`);
        });
      }

      // Show workflows
      if (result.data.workflows.length > 0) {
        console.log(`\n🔄 Discovered Workflows:`);
        result.data.workflows.forEach((workflow: any, idx: number) => {
          console.log(`   ${idx + 1}. ${workflow.name} (${workflow.steps.length} steps, priority: ${workflow.priority})`);
        });
      }

      console.log(`\n✅ Documentation saved to: ${reportPath}\n`);
    } catch (error) {
      spinner.fail('Workflow discovery failed');
      logger.error('Discovery failed', error as Error);
      process.exit(1);
    }
  });

// ============================================================================
// Helper Functions
// ============================================================================

async function checkPlaywrightBrowsers(browsers: string[]): Promise<boolean> {
  try {
    const { chromium, firefox, webkit } = await import('playwright');
    const browserMap: Record<string, any> = { chromium, firefox, webkit };

    // Try to get browser paths for each required browser
    for (const browser of browsers) {
      if (!browserMap[browser]) {
        logger.warn(`Unknown browser type: ${browser}`);
        continue;
      }

      try {
        // Try to get the executable path - this will throw if browser is not installed
        const executablePath = browserMap[browser].executablePath();
        if (!executablePath) {
          return false;
        }

        // Check if the executable actually exists
        try {
          await fs.access(executablePath);
        } catch {
          return false;
        }
      } catch {
        return false;
      }
    }

    return true;
  } catch (error) {
    logger.error('Failed to check Playwright browsers', error as Error);
    return false;
  }
}

// ============================================================================
// State Machine Execution
// ============================================================================

async function runStateMachine(
  orchestrator: OrchestratorAgent,
  session: Session,
  config: Config,
  db: DatabaseManager,
  spinner: any
): Promise<void> {
  let currentSession = session;
  let data: any = {};

  while (
    currentSession.state !== SessionState.COMPLETE &&
    currentSession.state !== SessionState.ERROR &&
    currentSession.state !== SessionState.AWAITING_APPROVAL
  ) {
    spinner.start(`State: ${currentSession.state}`);

    const result = await orchestrator.execute({
      session: currentSession,
      config,
      data,
    });

    if (!result.success) {
      spinner.fail(`Failed in state ${currentSession.state}`);
      logger.error('Execution failed', result.error!);
      break;
    }

    // Update data
    data = { ...data, ...result.data };

    // Update session state
    if (result.nextState) {
      db.updateSessionState(currentSession.id, result.nextState);
      currentSession.state = result.nextState;
      currentSession.updatedAt = new Date();
    }

    spinner.succeed(`Completed: ${currentSession.state}`);
  }

  if (currentSession.state === SessionState.AWAITING_APPROVAL) {
    spinner.info('Awaiting user approval. Use "pixeldust approve <session-id> <remediation-id>" to continue.');

    // Display remediation proposals
    const remediations = db.getRemediations(currentSession.id);
    console.log('\nRemediation Proposals:\n');
    for (const remediation of remediations) {
      console.log(`ID: ${remediation.id}`);
      console.log(`Title: ${remediation.proposal.title}`);
      console.log(`Description: ${remediation.proposal.description}\n`);
    }
  } else if (currentSession.state === SessionState.COMPLETE) {
    spinner.succeed('Session completed successfully!');
    console.log(`\nGenerate a report with: pixeldust report ${currentSession.id}`);
  }
}

program.parse();
