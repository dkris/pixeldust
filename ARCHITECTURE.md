# Agentic UI Testing System - Architecture

## Overview
An intelligent, multi-agent system for automated UI version testing, visual regression detection, and autonomous remediation.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    AGENTIC UI TESTING SYSTEM                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              TRIGGER LAYER                                    │  │
│  │  ┌────────────┐  ┌──────────────┐  ┌──────────────┐        │  │
│  │  │    CLI     │  │  VS Code     │  │   Cursor     │        │  │
│  │  │  Interface │  │  Extension   │  │  Extension   │        │  │
│  │  └────────────┘  └──────────────┘  └──────────────┘        │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                            │                                         │
│                            ▼                                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │         ORCHESTRATOR AGENT (Claude/GPT-4)                    │  │
│  │  • Coordinates all agents                                    │  │
│  │  • Maintains state machine                                   │  │
│  │  • Makes high-level decisions                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│         │              │              │              │               │
│    ┌────┴────┐    ┌────┴────┐   ┌────┴────┐   ┌────┴────┐         │
│    ▼         ▼    ▼         ▼   ▼         ▼   ▼         ▼         │
│  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐   │
│  │Env  │  │Test │  │Exec │  │Analy│  │Remed│  │Impl │  │Review│   │
│  │Agent│  │Gen  │  │Agent│  │sis  │  │Agent│  │Agent│  │Agent │   │
│  │     │  │Agent│  │     │  │Agent│  │     │  │     │  │     │   │
│  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘   │
│     │        │        │        │        │        │        │         │
│     ▼        ▼        ▼        ▼        ▼        ▼        ▼         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   EXECUTION LAYER                            │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐            │  │
│  │  │ Podman/    │  │ Playwright │  │    Git     │            │  │
│  │  │ Docker     │  │  Runner    │  │  Manager   │            │  │
│  │  │ Containers │  │            │  │            │            │  │
│  │  └────────────┘  └────────────┘  └────────────┘            │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                            │                                         │
│                            ▼                                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   STORAGE LAYER                              │  │
│  │  • Screenshots (S3/Local)                                    │  │
│  │  • Test Results (JSON)                                       │  │
│  │  • DOM Snapshots (HTML)                                      │  │
│  │  • Agent State (SQLite)                                      │  │
│  │  • Reports (Markdown/HTML)                                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Orchestrator Agent
**Responsibility:** Central coordinator managing the entire testing lifecycle.

**Capabilities:**
- State machine management (IDLE → SETUP → TEST → ANALYZE → REMEDIATE → IMPLEMENT → REVIEW)
- Agent coordination and task delegation
- Decision making based on analysis results
- User interaction management
- Error recovery and retry logic

### 2. Environment Agent
**Responsibility:** Container lifecycle management for version testing.

**Capabilities:**
- Spin up Podman/Docker containers for each version
- Configure networking between containers
- Health check monitoring
- Resource allocation and cleanup
- Environment variable injection

### 3. Test Generation Agent
**Responsibility:** AI-powered Playwright test generation.

**Capabilities:**
- Analyze UI5 web components structure
- Generate comprehensive test scenarios
- Create page object models
- Visual regression test creation
- Accessibility test generation

### 4. Execution Agent
**Responsibility:** Test execution and data collection.

**Capabilities:**
- Run Playwright tests across all versions
- Capture screenshots at key interaction points
- Extract DOM snapshots
- Collect performance metrics
- Parallel execution management

### 5. Analysis Agent
**Responsibility:** Compare results across versions.

**Capabilities:**
- Pixel-perfect visual comparison using Pixelmatch
- Intelligent DOM diffing (structure + semantics)
- CSS computed style comparison
- Accessibility tree comparison
- Performance regression detection

### 6. Remediation Agent
**Responsibility:** Propose fixes for detected issues.

**Capabilities:**
- AI-powered root cause analysis
- Generate fix proposals with confidence scores
- Create migration guides
- Suggest breaking change mitigations
- Prioritize issues by severity

### 7. Implementation Agent
**Responsibility:** Apply approved fixes.

**Capabilities:**
- Code generation for fixes
- Dependency updates
- Configuration changes
- Git branch management
- Automated testing of fixes

### 8. Review Agent
**Responsibility:** Validate implementations.

**Capabilities:**
- Re-run tests post-implementation
- Verify fix effectiveness
- Check for regression introduction
- Generate sign-off reports

## Data Flow

```
1. User Input (versions) → Orchestrator
2. Orchestrator → Environment Agent (spin up containers)
3. Orchestrator → Test Generation Agent (create tests)
4. Orchestrator → Execution Agent (run tests on all versions)
5. Execution Agent → Storage Layer (screenshots, DOM, metrics)
6. Orchestrator → Analysis Agent (compare results)
7. Analysis Agent → Remediation Agent (propose fixes)
8. Remediation Agent → User (approval request)
9. User Approval → Implementation Agent (apply fixes)
10. Implementation Agent → Review Agent (validate)
11. Review Agent → User (sign-off or iterate)
```

## State Machine

```
IDLE
  ↓
INITIALIZING (parse config, validate inputs)
  ↓
ENVIRONMENT_SETUP (container creation)
  ↓
TEST_GENERATION (AI test creation)
  ↓
TEST_EXECUTION (run across versions)
  ↓
ANALYSIS (compare results)
  ↓
REMEDIATION_PROPOSAL (generate fixes)
  ↓
AWAITING_APPROVAL (user decision)
  ↓
├─ APPROVED → IMPLEMENTING (apply fixes)
│                ↓
│              REVIEWING (validate fixes)
│                ↓
│              ├─ PASS → COMPLETE
│              └─ FAIL → ANALYSIS (iterate)
│
└─ REJECTED → REMEDIATION_PROPOSAL (revise)
```

## Storage Schema

### Screenshots
```
data/
  screenshots/
    {session_id}/
      {version}/
        {component}/
          {state}.png
```

### DOM Snapshots
```
data/
  dom/
    {session_id}/
      {version}/
        {component}.html
```

### Test Results
```
data/
  results/
    {session_id}/
      {version}/
        results.json
```

### Agent State (SQLite)
```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  config JSON,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE TABLE test_runs (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  version TEXT,
  status TEXT,
  results JSON,
  created_at TIMESTAMP
);

CREATE TABLE comparisons (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  base_version TEXT,
  target_version TEXT,
  differences JSON,
  severity TEXT,
  created_at TIMESTAMP
);

CREATE TABLE remediations (
  id TEXT PRIMARY KEY,
  comparison_id TEXT,
  proposal TEXT,
  confidence REAL,
  status TEXT,
  implementation JSON,
  created_at TIMESTAMP
);
```

## Technology Stack

### Core
- **Runtime:** Node.js 18+
- **Language:** TypeScript
- **AI SDK:** Anthropic SDK (Claude), OpenAI SDK
- **CLI Framework:** Commander.js
- **Configuration:** Cosmiconfig

### Testing & Comparison
- **UI Testing:** Playwright
- **Visual Comparison:** Pixelmatch, Resemble.js
- **DOM Diffing:** diff-dom, js-beautify
- **HTML Parsing:** JSDOM, Cheerio

### Infrastructure
- **Containers:** Dockerode (Docker/Podman SDK)
- **Database:** Better-SQLite3
- **Storage:** Local FS + optional S3 (AWS SDK)
- **Git:** Simple-git

### Reporting
- **Markdown:** Marked
- **HTML Generation:** Handlebars
- **Charts:** Chart.js (for metrics)

## Configuration Format

```typescript
interface Config {
  framework: {
    name: 'ui5-webcomponents';
    versions: string[]; // e.g., ['1.0.0', '2.0.0']
  };

  components: {
    include?: string[]; // specific components to test
    exclude?: string[];
  };

  containers: {
    runtime: 'podman' | 'docker';
    baseImage: string;
    resources: {
      memory: string;
      cpu: number;
    };
  };

  testing: {
    browsers: ('chromium' | 'firefox' | 'webkit')[];
    viewport: { width: number; height: number; };
    timeout: number;
    retries: number;
  };

  analysis: {
    visualThreshold: number; // 0-1, pixel difference tolerance
    domIgnoreAttributes?: string[];
    performanceThresholds?: {
      fcp: number; // First Contentful Paint
      lcp: number; // Largest Contentful Paint
    };
  };

  ai: {
    provider: 'anthropic' | 'openai';
    model: string;
    apiKey?: string; // or from env
  };

  storage: {
    type: 'local' | 's3';
    path: string;
    s3?: {
      bucket: string;
      region: string;
    };
  };

  reporting: {
    format: ('markdown' | 'html' | 'json')[];
    outputPath: string;
  };
}
```

## CLI Commands

```bash
# Initialize a new project
pixeldust init

# Run version comparison
pixeldust test --config pixeldust.config.json

# Run with specific versions
pixeldust test --versions 1.0.0,2.0.0,3.0.0

# Resume a previous session
pixeldust resume <session-id>

# View reports
pixeldust report <session-id>

# Interactive mode
pixeldust interactive
```

## VS Code Extension

```typescript
// Extension activation
export function activate(context: vscode.ExtensionContext) {
  // Command: Start UI Version Test
  context.subscriptions.push(
    vscode.commands.registerCommand('pixeldust.startTest', async () => {
      const config = await vscode.workspace.findFiles('**/pixeldust.config.{json,js}');
      // Launch orchestrator
    })
  );

  // WebView for results
  // Status bar integration
  // Quick picks for version selection
}
```

## Key Features

### 1. Intelligent Test Generation
- Analyzes component APIs and generates comprehensive tests
- Covers user interactions, edge cases, and accessibility
- Self-healing tests that adapt to minor changes

### 2. Multi-Dimensional Comparison
- **Visual:** Pixel-perfect + perceptual diff
- **Structural:** DOM tree comparison
- **Semantic:** Accessibility tree, ARIA attributes
- **Behavioral:** Event handlers, state management
- **Performance:** Rendering metrics, bundle size

### 3. AI-Powered Remediation
- Root cause analysis using LLM reasoning
- Confidence scoring for proposals
- Multiple solution alternatives
- Impact analysis for each fix

### 4. Autonomous Implementation
- Safe code transformation
- Git workflow automation
- Rollback capabilities
- Continuous validation

### 5. Human-in-the-Loop
- Approval gates for critical decisions
- Interactive exploration of differences
- Manual override capabilities
- Sign-off workflow

## Security Considerations

- API keys stored in environment variables
- Container isolation and sandboxing
- Read-only mounts for source code
- Network policy restrictions
- Audit logging of all agent actions

## Scalability

- Parallel container execution
- Distributed test execution (future: k8s)
- Incremental screenshot storage
- Result caching and deduplication

## Extensibility

- Plugin system for custom agents
- Custom comparison algorithms
- Framework adapters (UI5 → React, Vue, etc.)
- Custom reporters
- Webhook integrations

## Future Enhancements

1. **Multi-framework support:** React, Vue, Angular, Svelte
2. **Cloud deployment:** AWS/GCP/Azure runners
3. **Real browser testing:** BrowserStack/Sauce Labs integration
4. **AI model fine-tuning:** Domain-specific test generation
5. **Collaborative features:** Team dashboards, notifications
6. **CI/CD integration:** GitHub Actions, GitLab CI, Jenkins
