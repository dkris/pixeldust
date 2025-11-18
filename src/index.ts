/**
 * PixelDust - Agentic UI Version Testing System
 *
 * Main entry point for programmatic usage
 */

// Core exports
export { OrchestratorAgent } from './agents/orchestrator-agent';
export { HybridOrchestratorAgent } from './agents/hybrid-orchestrator-agent';
export { ApplicationLoaderAgent } from './agents/application-loader-agent';
export { EnvironmentAgent } from './agents/environment-agent';
export { TestGenerationAgent } from './agents/test-generation-agent';
export { ExecutionAgent } from './agents/execution-agent';
export { AnalysisAgent } from './agents/analysis-agent';
export { DependencyUpgradeAgent } from './agents/dependency-upgrade-agent';
export { TestFixingAgent } from './agents/test-fixing-agent';
export { RemediationAgent } from './agents/remediation-agent';
export { ImplementationAgent } from './agents/implementation-agent';
export { ReviewAgent } from './agents/review-agent';

// Storage
export { DatabaseManager } from './storage/database';

// Core
export { ConfigLoader } from './core/config-loader';
export { ReportGenerator } from './core/report-generator';

// Utils
export { Logger } from './utils/logger';

import { EventBus } from './core/event-bus';
import { StageContext } from './core/pipeline';

// Types
export * from './types';

/**
 * Main API for programmatic usage
 */
export class PixelDust {
  static async run(config: any) {
    const { DatabaseManager } = await import('./storage/database');
    const { v4: uuidv4 } = await import('uuid');
    const { createOrchestrator } = await import('./core/orchestrator-factory');

    const db = new DatabaseManager();
    const eventBus = new EventBus({ db });

    const session = {
      id: uuidv4(),
      state: 'IDLE' as any,
      config,
      versions: config.framework.versions,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const stageContext = new StageContext(session, config, eventBus);
    const { orchestrator } = createOrchestrator(db, config);
    const result = await orchestrator.execute(stageContext.createAgentContext());

    db.close();

    return result;
  }
}
