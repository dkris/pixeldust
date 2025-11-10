#!/usr/bin/env node

import { Command } from 'commander';
import { v4 as uuidv4 } from 'uuid';
import ora from 'ora';
import { ConfigLoader } from '../core/config-loader';
import { DatabaseManager } from '../storage/database';
import { OrchestratorAgent } from '../agents/orchestrator-agent';
import { Session, SessionState, Config } from '../types';
import { ReportGenerator } from '../core/report-generator';
import Logger from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';

const program = new Command();
const logger = new Logger('CLI');

program
  .name('pixeldust')
  .description('Agentic AI system for automated UI version testing and remediation')
  .version('0.1.0');

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
