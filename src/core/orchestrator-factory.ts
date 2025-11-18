import { DatabaseManager } from '../storage/database';
import { Config } from '../types';
import { OrchestratorAgent } from '../agents/orchestrator-agent';
import { HybridOrchestratorAgent } from '../agents/hybrid-orchestrator-agent';

export type OrchestratorMode = 'hybrid' | 'legacy';
export type OrchestratorInstance = OrchestratorAgent | HybridOrchestratorAgent;

export interface CreateOrchestratorOptions {
  modeOverride?: OrchestratorMode;
}

export function resolveOrchestratorMode(
  config: Config,
  overrideMode?: OrchestratorMode
): OrchestratorMode {
  if (overrideMode) {
    return overrideMode;
  }

  if (config.orchestration?.mode === 'legacy') {
    return 'legacy';
  }

  return 'hybrid';
}

export function createOrchestrator(
  db: DatabaseManager,
  config: Config,
  options?: CreateOrchestratorOptions
) {
  const mode = resolveOrchestratorMode(config, options?.modeOverride);
  const usePipeline = config.orchestration?.usePipeline !== false;

  const orchestrator: OrchestratorInstance =
    mode === 'hybrid'
      ? new HybridOrchestratorAgent(db, { usePipeline })
      : new OrchestratorAgent(db);

  config.orchestration = {
    ...config.orchestration,
    mode,
    usePipeline,
  };

  return { orchestrator, mode, usePipeline };
}
