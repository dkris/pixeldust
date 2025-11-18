/**
 * Core type definitions for the Agentic UI Testing System
 */
import type { LayeredContextManager, ContextLayerType } from '../core/context-manager';
import type { RetrievalService } from '../services/retrieval-service';
import type { AgentMemory } from '../services/agent-memory';

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
  application?: ApplicationConfig;
  upgrade?: UpgradeConfig;
}

export type FrameworkType = 'web-components' | 'react' | 'react-ui5' | 'vue' | 'angular';

export interface FrameworkConfig {
  name: string; // e.g., '@ui5/webcomponents', 'react', '@ui5/webcomponents-react'
  type?: FrameworkType; // Auto-detected if not specified
  versions: string[];
  relatedPackages?: string[]; // e.g., for React: ['react-dom'], for React UI5: ['@ui5/webcomponents']
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

export interface ApplicationConfig {
  path: string;
  entryPoint?: string;
  buildCommand: string;
  startCommand: string;
  testCommand?: string;
  port: number;
  testPaths?: string[];
  sourcePaths?: string[];
  packageJson?: string;
}

export interface UpgradeConfig {
  updatePeerDependencies: boolean;
  resolveConflicts?: 'auto' | 'manual';
  fixTests: boolean;
  testTimeout?: number;
  incremental?: boolean;
  createBranches?: boolean;
}

// ============================================================================
// State Machine Types
// ============================================================================

export enum SessionState {
  IDLE = 'IDLE',
  INITIALIZING = 'INITIALIZING',
  APPLICATION_LOADING = 'APPLICATION_LOADING',
  ENVIRONMENT_SETUP = 'ENVIRONMENT_SETUP',
  WORKFLOW_DISCOVERY = 'WORKFLOW_DISCOVERY',
  TEST_GENERATION = 'TEST_GENERATION',
  TEST_EXECUTION = 'TEST_EXECUTION',
  ANALYSIS = 'ANALYSIS',
  DEPENDENCY_UPGRADE = 'DEPENDENCY_UPGRADE',
  TEST_FIXING = 'TEST_FIXING',
  REMEDIATION_PROPOSAL = 'REMEDIATION_PROPOSAL',
  AWAITING_APPROVAL = 'AWAITING_APPROVAL',
  IMPLEMENTING = 'IMPLEMENTING',
  REVIEWING = 'REVIEWING',
  EVALUATION = 'EVALUATION',
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
  APPLICATION_LOADER = 'APPLICATION_LOADER',
  ENVIRONMENT = 'ENVIRONMENT',
  WORKFLOW_DISCOVERY = 'WORKFLOW_DISCOVERY',
  TEST_GENERATION = 'TEST_GENERATION',
  EXECUTION = 'EXECUTION',
  ANALYSIS = 'ANALYSIS',
  DEPENDENCY_UPGRADE = 'DEPENDENCY_UPGRADE',
  TEST_FIXING = 'TEST_FIXING',
  REMEDIATION = 'REMEDIATION',
  IMPLEMENTATION = 'IMPLEMENTATION',
  REVIEW = 'REVIEW',
  EVALUATION = 'EVALUATION',
}

export interface Agent {
  type: AgentType;
  execute(context: AgentContext): Promise<AgentResult>;
}

export interface AgentContext {
  session: Session;
  config: Config;
  data?: Record<string, any>;
  layers: LayeredContextManager;
  retrieval: RetrievalService;
  memory: AgentMemory;
  fingerprint: string;
  pruneLayers: (layers?: ContextLayerType[]) => void;
}

export interface AgentResult {
  success: boolean;
  data?: any;
  error?: Error;
  nextState?: SessionState;
  tokensUsed?: number;
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
// Workflow Discovery Types
// ============================================================================

/**
 * Represents a discovered page in the application
 */
export interface Page {
  /** URL/route of the page */
  url: string;
  /** Page title */
  title: string;
  /** Components found on this page */
  components: PageComponent[];
  /** Interactive elements (buttons, links, forms) */
  interactiveElements: InteractiveElement[];
  /** Links to other pages */
  links: string[];
  /** Screenshot of the page */
  screenshot?: string;
  /** When this page was discovered */
  discoveredAt: Date;
}

/**
 * Component usage on a specific page
 */
export interface PageComponent {
  /** Component tag name (e.g., ui5-button) */
  tag: string;
  /** Number of instances on the page */
  count: number;
  /** CSS selectors for instances */
  selectors: string[];
  /** Whether component is visible on initial load */
  visible: boolean;
  /** Component attributes */
  attributes?: Record<string, string>;
}

/**
 * Interactive element that can be part of a workflow
 */
export interface InteractiveElement {
  /** Type of element */
  type: 'button' | 'link' | 'input' | 'form' | 'select' | 'other';
  /** CSS selector */
  selector: string;
  /** Text content or label */
  text?: string;
  /** Target URL for links */
  href?: string;
  /** Action performed (e.g., "submit", "navigate") */
  action?: string;
  /** Component tag if it's a web component */
  componentTag?: string;
}

/**
 * User workflow - sequence of pages and interactions
 */
export interface Workflow {
  /** Unique workflow identifier */
  id: string;
  /** Workflow name/description */
  name: string;
  /** Starting page */
  startPage: string;
  /** Sequence of steps in the workflow */
  steps: WorkflowStep[];
  /** Components involved in this workflow */
  components: string[];
  /** Estimated workflow priority (based on link depth, etc.) */
  priority: 'high' | 'medium' | 'low';
  /** Phase 3: Preconditions required to start workflow */
  preconditions?: WorkflowCondition[];
  /** Phase 3: Expected postconditions after workflow completion */
  postconditions?: WorkflowCondition[];
  /** Phase 3: Data dependencies and flow */
  dataFlow?: DataFlowNode[];
  /** Estimated completion time in seconds */
  estimatedDuration?: number;
  /** Tags for categorization */
  tags?: string[];
}

/**
 * A step in a user workflow
 */
export interface WorkflowStep {
  /** Step sequence number */
  order: number;
  /** Page URL */
  page: string;
  /** Action to perform */
  action?: {
    type: 'click' | 'input' | 'submit' | 'navigate' | 'wait' | 'verify';
    selector?: string;
    value?: string;
    description: string;
  };
  /** Expected outcome */
  expectedOutcome?: string;
  /** Phase 3: State before this step */
  preState?: ApplicationState;
  /** Phase 3: Expected state after this step */
  postState?: ApplicationState;
  /** Phase 3: Data required for this step */
  requiredData?: string[];
  /** Phase 3: Data produced by this step */
  producedData?: string[];
}

/**
 * Phase 3: Workflow condition (precondition or postcondition)
 */
export interface WorkflowCondition {
  /** Condition type */
  type: 'authentication' | 'data' | 'state' | 'permission';
  /** Human-readable description */
  description: string;
  /** Validation rule */
  rule: string;
  /** Whether this is required (true) or optional (false) */
  required: boolean;
}

/**
 * Phase 3: Application state at a point in time
 */
export interface ApplicationState {
  /** URL/route */
  url: string;
  /** Local storage data */
  localStorage?: Record<string, string>;
  /** Session storage data */
  sessionStorage?: Record<string, string>;
  /** Cookies */
  cookies?: Array<{ name: string; value: string }>;
  /** DOM state indicators */
  domState?: Record<string, any>;
  /** Custom application state */
  appState?: Record<string, any>;
}

/**
 * Phase 3: Data flow node in a workflow
 */
export interface DataFlowNode {
  /** Step number where data is produced */
  sourceStep: number;
  /** Step number where data is consumed */
  targetStep: number;
  /** Data identifier/name */
  dataKey: string;
  /** Data type */
  dataType: 'input' | 'computed' | 'fetched' | 'stored';
  /** Whether data persists across steps */
  persistent: boolean;
}

/**
 * Complete workflow discovery result
 */
export interface WorkflowDiscoveryResult {
  /** All discovered pages */
  pages: Page[];
  /** All discovered workflows */
  workflows: Workflow[];
  /** Component usage summary */
  componentUsage: ComponentUsageSummary[];
  /** Discovery timestamp */
  discoveredAt: Date;
  /** Application URL that was crawled */
  applicationUrl: string;
}

/**
 * Summary of how a component is used across the application
 */
export interface ComponentUsageSummary {
  /** Component tag name */
  tag: string;
  /** Total number of pages using this component */
  pageCount: number;
  /** Total instances across all pages */
  totalInstances: number;
  /** Pages where this component appears */
  pages: string[];
  /** Common usage patterns */
  patterns: string[];
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
// Evaluation Types
// ============================================================================

export interface Evaluation {
  id: string;
  sessionId: string;
  agentType: AgentType;
  metrics: EvaluationMetrics;
  feedback: EvaluationFeedback;
  timestamp: Date;
}

export interface EvaluationMetrics {
  testQuality: TestQualityMetrics;
  comparisonQuality: ComparisonQualityMetrics;
  remediationEffectiveness?: RemediationEffectivenessMetrics;
  overallScore: number; // 0-100
}

export interface TestQualityMetrics {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  successRate: number; // 0-1
  coverageScore: number; // 0-100
  componentCoverage: Record<string, number>; // component -> coverage percentage
  categoryDistribution: Record<TestCategory, number>; // category -> test count
  averageTestDuration: number; // milliseconds
}

export interface ComparisonQualityMetrics {
  totalComparisons: number;
  detectedDifferences: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number; // 0-1
  recall: number; // 0-1
  averageSimilarityScore: number; // 0-100
  accuracyScore: number; // 0-100
}

export interface RemediationEffectivenessMetrics {
  totalRemediations: number;
  approvedRemediations: number;
  implementedRemediations: number;
  verifiedRemediations: number;
  successRate: number; // 0-1
  averageImplementationTime: number; // milliseconds
  averageConfidence: number; // 0-1
}

export interface EvaluationFeedback {
  strengths: string[];
  weaknesses: string[];
  recommendations: Recommendation[];
  promptImprovements?: PromptImprovement[];
  configSuggestions?: ConfigSuggestion[];
}

export interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  category: 'test-generation' | 'comparison' | 'remediation' | 'workflow';
  title: string;
  description: string;
  actionable: boolean;
  estimatedImpact: 'high' | 'medium' | 'low';
}

export interface PromptImprovement {
  agentType: AgentType;
  currentIssue: string;
  suggestedChange: string;
  expectedImprovement: string;
  confidence: number; // 0-1
}

export interface ConfigSuggestion {
  configPath: string; // e.g., "testing.timeout"
  currentValue: any;
  suggestedValue: any;
  rationale: string;
  impact: 'high' | 'medium' | 'low';
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
