/**
 * Core type definitions for the Agentic UI Testing System
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface Config {
  framework: FrameworkConfig;
  components: ComponentConfig;
  containers: ContainerConfig;
  testing: TestingConfig;
  analysis: AnalysisConfig;
  ai: AIConfig;
  storage: StorageConfig;
  reporting: ReportingConfig;
}

export interface FrameworkConfig {
  name: 'ui5-webcomponents' | string;
  versions: string[];
}

export interface ComponentConfig {
  include?: string[];
  exclude?: string[];
}

export interface ContainerConfig {
  runtime: 'podman' | 'docker';
  baseImage: string;
  resources: {
    memory: string;
    cpu: number;
  };
  network?: {
    mode: 'bridge' | 'host' | 'none';
  };
}

export interface TestingConfig {
  browsers: ('chromium' | 'firefox' | 'webkit')[];
  viewport: {
    width: number;
    height: number;
  };
  timeout: number;
  retries: number;
  headless?: boolean;
}

export interface AnalysisConfig {
  visualThreshold: number;
  domIgnoreAttributes?: string[];
  performanceThresholds?: {
    fcp: number;
    lcp: number;
    tti: number;
  };
}

export interface AIConfig {
  provider: 'anthropic' | 'openai';
  model: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface StorageConfig {
  type: 'local' | 's3';
  path: string;
  s3?: {
    bucket: string;
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  };
}

export interface ReportingConfig {
  format: ('markdown' | 'html' | 'json')[];
  outputPath: string;
}

// ============================================================================
// State Machine Types
// ============================================================================

export enum SessionState {
  IDLE = 'IDLE',
  INITIALIZING = 'INITIALIZING',
  ENVIRONMENT_SETUP = 'ENVIRONMENT_SETUP',
  TEST_GENERATION = 'TEST_GENERATION',
  TEST_EXECUTION = 'TEST_EXECUTION',
  ANALYSIS = 'ANALYSIS',
  REMEDIATION_PROPOSAL = 'REMEDIATION_PROPOSAL',
  AWAITING_APPROVAL = 'AWAITING_APPROVAL',
  IMPLEMENTING = 'IMPLEMENTING',
  REVIEWING = 'REVIEWING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR',
}

export interface Session {
  id: string;
  state: SessionState;
  config: Config;
  versions: string[];
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

// ============================================================================
// Agent Types
// ============================================================================

export enum AgentType {
  ORCHESTRATOR = 'ORCHESTRATOR',
  ENVIRONMENT = 'ENVIRONMENT',
  TEST_GENERATION = 'TEST_GENERATION',
  EXECUTION = 'EXECUTION',
  ANALYSIS = 'ANALYSIS',
  REMEDIATION = 'REMEDIATION',
  IMPLEMENTATION = 'IMPLEMENTATION',
  REVIEW = 'REVIEW',
}

export interface Agent {
  type: AgentType;
  execute(context: AgentContext): Promise<AgentResult>;
}

export interface AgentContext {
  session: Session;
  config: Config;
  data?: Record<string, any>;
}

export interface AgentResult {
  success: boolean;
  data?: any;
  error?: Error;
  nextState?: SessionState;
}

// ============================================================================
// Testing Types
// ============================================================================

export interface TestSuite {
  id: string;
  sessionId: string;
  version: string;
  component: string;
  tests: Test[];
  generatedAt: Date;
}

export interface Test {
  id: string;
  name: string;
  description: string;
  code: string;
  category: TestCategory;
}

export enum TestCategory {
  FUNCTIONAL = 'FUNCTIONAL',
  VISUAL = 'VISUAL',
  ACCESSIBILITY = 'ACCESSIBILITY',
  PERFORMANCE = 'PERFORMANCE',
}

export interface TestResult {
  id: string;
  testId: string;
  sessionId: string;
  version: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  screenshots: Screenshot[];
  domSnapshot?: string;
  metrics?: PerformanceMetrics;
  executedAt: Date;
}

export interface Screenshot {
  id: string;
  path: string;
  name: string;
  state: string;
  buffer?: Buffer;
}

export interface PerformanceMetrics {
  fcp: number;
  lcp: number;
  tti: number;
  cls: number;
  fid: number;
  bundleSize?: number;
}

// ============================================================================
// Analysis Types
// ============================================================================

export interface ComparisonResult {
  id: string;
  sessionId: string;
  baseVersion: string;
  targetVersion: string;
  component: string;
  differences: Difference[];
  severity: Severity;
  createdAt: Date;
}

export interface Difference {
  type: DifferenceType;
  category: DifferenceCategory;
  severity: Severity;
  description: string;
  location?: string;
  baseValue?: any;
  targetValue?: any;
  visualDiff?: VisualDiff;
  domDiff?: DOMDiff;
}

export enum DifferenceType {
  VISUAL = 'VISUAL',
  STRUCTURAL = 'STRUCTURAL',
  BEHAVIORAL = 'BEHAVIORAL',
  PERFORMANCE = 'PERFORMANCE',
  ACCESSIBILITY = 'ACCESSIBILITY',
}

export enum DifferenceCategory {
  BREAKING = 'BREAKING',
  DEPRECATED = 'DEPRECATED',
  ENHANCEMENT = 'ENHANCEMENT',
  BUG_FIX = 'BUG_FIX',
}

export enum Severity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
  INFO = 'INFO',
}

export interface VisualDiff {
  pixelDiffCount: number;
  pixelDiffPercentage: number;
  diffImagePath: string;
  baseImagePath: string;
  targetImagePath: string;
  perceptualScore?: number;
}

export interface DOMDiff {
  added: DOMNode[];
  removed: DOMNode[];
  modified: DOMNodeChange[];
}

export interface DOMNode {
  tagName: string;
  attributes: Record<string, string>;
  path: string;
}

export interface DOMNodeChange {
  path: string;
  attribute: string;
  oldValue: any;
  newValue: any;
}

// ============================================================================
// Remediation Types
// ============================================================================

export interface Remediation {
  id: string;
  comparisonId: string;
  sessionId: string;
  proposal: RemediationProposal;
  status: RemediationStatus;
  implementation?: Implementation;
  createdAt: Date;
  updatedAt: Date;
}

export interface RemediationProposal {
  title: string;
  description: string;
  rootCause: string;
  solutions: Solution[];
  recommendedSolution: string;
  estimatedImpact: Impact;
}

export interface Solution {
  id: string;
  title: string;
  description: string;
  steps: string[];
  codeChanges?: CodeChange[];
  confidence: number;
  pros: string[];
  cons: string[];
}

export interface CodeChange {
  filePath: string;
  changeType: 'add' | 'modify' | 'delete';
  before?: string;
  after?: string;
  lineNumber?: number;
}

export interface Impact {
  breakingChanges: boolean;
  affectedComponents: string[];
  migrationComplexity: 'low' | 'medium' | 'high';
  estimatedEffort: string;
}

export enum RemediationStatus {
  PROPOSED = 'PROPOSED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  IMPLEMENTING = 'IMPLEMENTING',
  IMPLEMENTED = 'IMPLEMENTED',
  VERIFIED = 'VERIFIED',
  FAILED = 'FAILED',
}

export interface Implementation {
  solutionId: string;
  appliedChanges: CodeChange[];
  commitHash?: string;
  branchName?: string;
  verificationResults?: TestResult[];
  implementedAt: Date;
}

// ============================================================================
// Container Types
// ============================================================================

export interface Container {
  id: string;
  name: string;
  version: string;
  status: ContainerStatus;
  ipAddress?: string;
  port?: number;
  createdAt: Date;
}

export enum ContainerStatus {
  CREATING = 'CREATING',
  RUNNING = 'RUNNING',
  STOPPED = 'STOPPED',
  ERROR = 'ERROR',
}

// ============================================================================
// Report Types
// ============================================================================

export interface Report {
  sessionId: string;
  title: string;
  summary: ReportSummary;
  comparisons: ComparisonResult[];
  remediations: Remediation[];
  generatedAt: Date;
}

export interface ReportSummary {
  totalVersions: number;
  totalTests: number;
  totalDifferences: number;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
  approvedRemediations: number;
  pendingRemediations: number;
}

// ============================================================================
// Event Types
// ============================================================================

export interface Event {
  type: EventType;
  sessionId: string;
  agentType?: AgentType;
  data?: any;
  timestamp: Date;
}

export enum EventType {
  SESSION_STARTED = 'SESSION_STARTED',
  STATE_CHANGED = 'STATE_CHANGED',
  AGENT_STARTED = 'AGENT_STARTED',
  AGENT_COMPLETED = 'AGENT_COMPLETED',
  AGENT_ERROR = 'AGENT_ERROR',
  APPROVAL_REQUESTED = 'APPROVAL_REQUESTED',
  APPROVAL_RECEIVED = 'APPROVAL_RECEIVED',
  SESSION_COMPLETED = 'SESSION_COMPLETED',
  SESSION_ERROR = 'SESSION_ERROR',
}

// ============================================================================
// Utility Types
// ============================================================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;
