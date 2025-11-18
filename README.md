# PixelDust - Agentic UI Version Testing System

An intelligent, multi-agent system for automated UI version testing with application-aware workflow discovery, visual regression detection, and autonomous remediation.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)

## Overview

PixelDust is an AI-powered testing system that automatically discovers your application structure, generates intelligent tests, and migrates UI frameworks with minimal human intervention.

**What Makes PixelDust Unique:**
- 🔍 **Automatic Workflow Discovery**: Crawls your running application to understand pages, routes, and user journeys
- 🧠 **Application-Aware Testing**: Tests components in their real application context, not in isolation
- 🤖 **13 Specialized AI Agents**: Each agent focuses on a specific aspect of testing and migration
- 🔄 **Full Automation**: From discovery to dependency upgrade to test fixing to deployment
- 📊 **Continuous Evaluation**: Real-time quality monitoring and feedback during execution
- 🐳 **Native Podman Support**: Rootless containers for enhanced security

**Core Capabilities:**
- ✅ Discovers application structure automatically (pages, workflows, component usage)
- ✅ Generates context-aware tests based on real user workflows
- ✅ Tests YOUR actual application code, not just components
- ✅ Compares multiple framework versions in parallel
- ✅ Detects breaking changes (visual, DOM, API, performance)
- ✅ AI-powered root cause analysis and fix proposals
- ✅ Automatically upgrades dependencies and fixes broken tests
- ✅ Verifies fixes and iterates until all tests pass
- ✅ Generates comprehensive reports with visual diffs

## Supported Frameworks

PixelDust supports multiple UI framework ecosystems with intelligent upgrade capabilities:

### Web Components
- **UI5 Web Components** (`@ui5/webcomponents`) - SAP's enterprise web components
- **Fluent UI Web Components** (`@fluentui/web-components`) - Microsoft's design system
- **Shoelace** (`@shoelace-style/shoelace`) - Modern web component library
- **Material Web** (`@material/web`) - Google's Material Design components

### React Ecosystem
- **React** (`react`) - Core React library upgrades (v16 → v17 → v18 → v19)
  - Automatically upgrades `react-dom` to matching versions
  - Updates TypeScript types (`@types/react`, `@types/react-dom`)
  - Handles React 18+ breaking changes (createRoot, concurrent features)

- **UI5 Web Components for React** (`@ui5/webcomponents-react`) - React wrappers for UI5
  - Manages peer dependencies (`react`, `react-dom`, `@ui5/webcomponents`)
  - Detects React component usage patterns (PascalCase imports)
  - Handles both component libraries simultaneously

### Framework-Specific Features

**React Support:**
- 🔍 Detects JSX/TSX component usage patterns
- 🔄 Upgrades React, React-DOM, and TypeScript types together
- 📦 Handles peer dependency resolution automatically
- 🧪 Generates React-specific test patterns
- 🛠️ Supports React 18+ concurrent features and new APIs

**UI5 React Support:**
- 🎯 Manages dual framework dependencies (React + UI5 Web Components)
- 🔍 Detects UI5 React components from imports (`@ui5/webcomponents-react`)
- 📊 Tests both React rendering and web component integration
- ⚡ Ensures version compatibility across the ecosystem

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PIXELDUST AGENTIC SYSTEM                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │         USER INTERFACES (Trigger Layer)                      │  │
│  │                                                               │  │
│  │   [CLI] ────────── [VS Code Ext] ────────── [Cursor Ext]    │  │
│  │     │                    │                        │          │  │
│  └─────┼────────────────────┼────────────────────────┼──────────┘  │
│        │                    │                        │              │
│        └────────────────────┴────────────────────────┘              │
│                             │                                        │
│                             ▼                                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │      ORCHESTRATOR (Hybrid Pipeline + Event System)           │  │
│  │                                                               │  │
│  │   State Machine: Coordinates agent execution flow            │  │
│  │   Event Bus: Real-time monitoring and evaluation             │  │
│  │   Pipeline: Structured dependency management                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                             │                                        │
│                             ▼                                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │               AGENT EXECUTION PIPELINE                        │  │
│  │                                                               │  │
│  │  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐ │  │
│  │  │  Phase 0 │   │  Phase 1 │   │  Phase 2 │   │  Phase 3 │ │  │
│  │  │   SETUP  │ → │ DISCOVER │ → │   TEST   │ → │ REMEDIATE│ │  │
│  │  └──────────┘   └──────────┘   └──────────┘   └──────────┘ │  │
│  │       │              │              │              │         │  │
│  │       ▼              ▼              ▼              ▼         │  │
│  │                                                               │  │
│  │  [AppLoader]   [Workflow]     [TestGen]      [Analysis]     │  │
│  │  [Environment] [Discovery]    [Execution]    [Remediation]  │  │
│  │                [Component      [Performance]  [DepUpgrade]   │  │
│  │                 Scanner]                      [TestFixing]   │  │
│  │                                               [Review]       │  │
│  │                                                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                             │                                        │
│                             ▼                                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              CONTINUOUS EVALUATION LAYER                      │  │
│  │                                                               │  │
│  │  [Metrics]  [Quality Alerts]  [Feedback]  [Recommendations] │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Application-Aware Testing Pipeline

PixelDust implements a three-phase strategy for intelligent, context-aware testing:

```
┌────────────────────────────────────────────────────────────────────┐
│  PHASE 1: Application-Aware Testing                                │
│  ✅ Dual-mode test generation (framework vs application)           │
│  ✅ Application-context aware prompts                              │
│  ✅ Lenient test execution for real workflows                      │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  PHASE 2: Workflow Discovery (Automatic)                           │
│  ✅ Crawls running application to discover pages                   │
│  ✅ Maps components to pages with usage counts                     │
│  ✅ Identifies interactive elements and workflows                  │
│  ✅ Builds workflow graphs from navigation patterns                │
│  ✅ Detects usage patterns (forms, dashboards, lists)              │
│  ✅ Provides rich context for test generation                      │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  PHASE 3: Full Workflow Testing (Coming Soon)                      │
│  ⏳ Multi-page workflow execution                                  │
│  ⏳ Application state verification between steps                   │
│  ⏳ Complete user journey validation                               │
│  ⏳ Data persistence testing across workflows                      │
└────────────────────────────────────────────────────────────────────┘
```

**How It Works:**

1. **Application Loading**: Mounts your application code into containers
2. **Workflow Discovery**: Crawls running app to discover pages, components, and user flows
3. **Component Analysis**: Scans source code for component imports and usage
4. **Intelligent Test Generation**: Creates tests based on actual application workflows
5. **Parallel Execution**: Runs tests across multiple versions simultaneously
6. **Multi-Dimensional Analysis**: Compares visual, DOM, performance, and accessibility
7. **AI-Powered Remediation**: Analyzes differences and proposes intelligent fixes
8. **Autonomous Implementation**: Applies fixes, commits changes, and re-validates

See [ARCHITECTURE.md](./ARCHITECTURE.md) and [HYBRID_ARCHITECTURE.md](./HYBRID_ARCHITECTURE.md) for detailed documentation.

## 13 Specialized AI Agents

| Agent | Responsibility | Key Features |
|-------|---------------|--------------|
| **Orchestrator** | Coordinates entire lifecycle | State machine, event emission, pipeline management |
| **ApplicationLoader** | Loads real application code | Docker/Podman integration, dependency installation |
| **Environment** | Manages test environments | Isolated containers per version, port management |
| **WorkflowDiscovery** | Discovers app structure | Page crawling, component mapping, workflow graphs |
| **TestGeneration** | Creates intelligent tests | Workflow-aware, AI-powered, category-balanced |
| **Execution** | Runs tests in parallel | Multi-browser, screenshot capture, metrics collection |
| **Analysis** | Compares versions | Visual diff, DOM comparison, performance analysis |
| **DependencyUpgrade** | Updates dependencies | package.json modification, peer dependency resolution |
| **TestFixing** | Fixes broken tests | AI-powered analysis, API migration, assertion updates |
| **Remediation** | Proposes code fixes | Root cause analysis, multiple solutions, confidence scores |
| **Implementation** | Applies approved fixes | Git integration, feature branches, atomic commits |
| **Review** | Verifies implementations | Re-execution, regression detection, quality gates |
| **Evaluation** | Continuous improvement | Quality metrics, feedback generation, recommendations |

## Two Modes of Operation

### 1. Framework-Only Mode (Quick Evaluation)

Fast comparison of framework versions in isolation.

**Use Cases:**
- Evaluating upgrade impact before starting
- Testing framework components standalone
- Quick compatibility checks

**Example Config:**
```json
{
  "framework": {
    "name": "@ui5/webcomponents",
    "versions": ["1.24.0", "2.0.0"]
  },
  "components": {
    "include": ["ui5-button", "ui5-input", "ui5-table"]
  }
}
```

### 2. Application Mode (Full Automated Migration) ⭐

Tests your real application with automatic workflow discovery.

**Use Cases:**
- Complete framework migrations
- Production application testing
- Workflow-based validation

**Features:**
- ✅ Automatic workflow discovery
- ✅ Component usage mapping
- ✅ Application-aware test generation
- ✅ Dependency auto-upgrade
- ✅ AI-powered test fixing
- ✅ End-to-end migration

### State Machine Context Hygiene

The orchestrator's state machine now mirrors the pipeline executor's hygiene loop: each transition emits `STAGE_STARTED`/`STAGE_COMPLETED` events on the shared `EventBus`, then prunes `StageContext`'s ephemeral layers. This keeps prompt/retrieval caches for short-lived work (like workflow discovery artifacts) from growing unbounded while preserving persistent and shared layers for downstream agents.

**Example Config:**
```json
{
  "framework": {
    "name": "@ui5/webcomponents",
    "versions": ["1.24.0", "2.0.0"]
  },
  "application": {
    "path": "./my-ui5-app",
    "buildCommand": "npm run build",
    "startCommand": "npm start",
    "port": 8080,
    "sourcePaths": ["src/**/*.tsx", "src/**/*.ts"]
  },
  "components": {
    "exclude": ["ui5-shellbar"]
  }
}
```

**What Happens Automatically:**
1. 📦 Loads your application into containers
2. 🔍 Crawls running app to discover pages and workflows
3. 🔎 Scans source code for component imports and usage
4. 🤖 Generates workflow-aware tests
5. 🧪 Tests with multiple framework versions
6. 📊 Analyzes differences (visual, DOM, performance)
7. ⬆️  Upgrades dependencies automatically
8. 🔧 Fixes broken tests with AI
9. ✅ Verifies everything works
10. 📝 Generates comprehensive reports

## Key Features

### 🔍 Automatic Workflow Discovery

```
Application: http://localhost:8080
    │
    ├─ Page: / (Home)
    │   ├─ ui5-button (3 instances)
    │   ├─ ui5-input (2 instances)
    │   └─ Links: [/dashboard, /login]
    │
    ├─ Page: /dashboard
    │   ├─ ui5-table (1 instance)
    │   ├─ ui5-card (4 instances)
    │   └─ Workflow: "View data" (Priority: HIGH)
    │
    └─ Page: /login
        ├─ ui5-input (2 instances)
        ├─ ui5-button (1 instance)
        └─ Workflow: "User authentication" (Priority: HIGH)

Component Usage Summary:
- ui5-button: 5 pages, 12 instances
  - Patterns: form-input, dashboard-widget
- ui5-table: 2 pages, 3 instances
  - Patterns: dashboard-widget, list-item
```

### 🧠 Application-Aware Test Generation

Instead of generic component tests, PixelDust generates tests based on real usage:

**Before (Generic):**
```typescript
test('ui5-button renders', async ({ page }) => {
  await page.goto('/test-page');
  const button = page.locator('ui5-button');
  await expect(button).toBeVisible();
});
```

**After (Application-Aware):**
```typescript
test('ui5-button-login-form-submission', async ({ page }) => {
  // Navigate to actual login page
  await page.goto('/login');

  // Test button in context of login workflow
  const submitButton = page.locator('ui5-button#submit-login');
  await expect(submitButton).toBeVisible();

  // Verify button behavior affects application state
  await submitButton.click();
  await expect(page).toHaveURL('/dashboard');
});
```

The AI receives workflow context:
```
WORKFLOW CONTEXT (discovered from application):
- ui5-button is used on 5 page(s): /, /login, /dashboard, /settings, /checkout
- Total instances: 12
- Common patterns: form-input, dashboard-widget

Pages containing ui5-button:
- "Login" (/login): 3 instance(s)
- "Dashboard" (/dashboard): 4 instance(s)

Relevant Workflows:
- "User authentication" (Priority: high)
  1. Navigate to Login page
  2. Enter credentials
  3. Click submit button
  4. Verify dashboard loads
```

### 📊 Multi-Dimensional Analysis

**Visual Comparison:**
- Pixel-perfect diffing with configurable threshold
- Perceptual difference highlighting
- Side-by-side visualization
- Diff image generation

**DOM Comparison:**
- Structural analysis (added/removed/modified elements)
- Attribute changes
- Semantic comparison
- Accessibility tree diffing

**Performance Analysis:**
- First Contentful Paint (FCP)
- Largest Contentful Paint (LCP)
- Time to Interactive (TTI)
- Resource usage tracking

**Accessibility Validation:**
- ARIA attribute comparison
- Keyboard navigation testing
- Screen reader compatibility
- Contrast ratio analysis

### 💡 AI-Powered Remediation

**Root Cause Analysis:**
- Identifies why tests fail
- Categorizes issue types (API, visual, behavioral)
- Traces impact through dependency chain

**Multiple Solution Proposals:**
- Generates 2-3 fix options per issue
- Provides confidence scores (0-100)
- Estimates implementation effort
- Assesses impact and risks

**Automatic Implementation:**
- Creates feature branches
- Applies code changes atomically
- Commits with descriptive messages
- Re-runs tests to verify fixes

### 🚀 Performance & Intelligence Features

**Smart Test Caching:**
- **80-95% token cost reduction** for repeated test runs
- Tests cached by component + framework version
- Automatic cache invalidation (30 days or major version change)
- **10x faster** test generation on cached runs

**Layered Context & Memory System:**
- Immutable stage contexts now manage **persistent / shared / ephemeral** layers
- Built-in retrieval service lets agents request only the slices they need
- Agents learn from past sessions and receive prompt hints from evaluation memories
- Automatic context fingerprints tag every event for traceability

**Enhanced Observability & Resilience:**
- Track token usage per agent with context fingerprints
- Performance metrics (duration, success rate) emitted per stage
- Cost attribution and analytics stay tied to context versions
- Built-in retry + circuit-breaker policies with automatic context repair notes

**Optimized Prompts:**
- 40-60% reduction in context size
- Smarter workflow summaries
- Reduced API costs without quality loss

**Usage:**
```bash
# Use cached tests (default - fast & cheap)
pixeldust test

# Force regenerate all tests (bypass cache)
pixeldust test --force-regenerate

# View cache statistics
pixeldust show-tests <session-id> --cache-stats
```

**Benefits:**
- First run: ~23% cost reduction (optimized prompts)
- Cached runs: ~92% cost reduction (cached tests + optimizations)
- Faster test generation: ~30x speedup with cache
- Smarter agents: Learn from history

See [IMPLEMENTATION_NOTES.md](./IMPLEMENTATION_NOTES.md) for technical details.

## Installation

```bash
npm install -g @pixeldust/ui-version-tester
```

Or use locally:
```bash
npm install --save-dev @pixeldust/ui-version-tester
```

## Standalone Workflow Discovery

The `discover-workflows` command allows you to independently discover and document your application's structure without running the full test suite. This is useful for:

- Understanding application architecture before testing
- Generating comprehensive workflow documentation
- Sharing application structure with team members
- Planning test coverage strategies

### Usage

**With a running application:**
```bash
# Discover workflows from a running application
pixeldust discover-workflows --url http://localhost:3000

# With custom options
pixeldust discover-workflows \
  --url http://localhost:3000 \
  --output ./docs/workflows.md \
  --format markdown \
  --max-depth 3 \
  --max-pages 50
```

**With PixelDust configuration:**
```bash
# Use existing configuration
pixeldust discover-workflows --config .pixeldustrc.json

# Override URL from config
pixeldust discover-workflows \
  --config .pixeldustrc.json \
  --url http://localhost:8080
```

### Output Formats

- **Markdown** (default): Human-readable documentation with Mermaid diagrams
- **JSON**: Machine-readable workflow data for automation
- **HTML**: Interactive documentation with navigation

### Generated Documentation

The workflow documentation includes:

- **Executive Summary**: Overview of application structure
- **Application Site Map**: Visual representation of page hierarchy
- **Detailed Page Information**: Components, interactive elements, and navigation
- **Workflow Visualization**: Mermaid diagrams showing user flows
- **Component Usage Analysis**: Where components are used across the application
- **Navigation Graph**: How pages connect to each other

### Example Output

```bash
$ pixeldust discover-workflows --url http://localhost:3000

📊 Discovery Summary:
   Application: http://localhost:3000
   Pages Discovered: 12
   Workflows Identified: 5
   Components Found: 28
   Format: markdown
   Output: ./workflow-documentation.md

🎯 Top Components:
   ui5-button - used 45 time(s) across 12 page(s)
   ui5-input - used 23 time(s) across 8 page(s)
   ui5-table - used 15 time(s) across 6 page(s)

🔄 Discovered Workflows:
   1. User Authentication Flow (4 steps, priority: high)
   2. Dashboard Navigation (3 steps, priority: high)
   3. Data Entry Workflow (6 steps, priority: medium)

✅ Documentation saved to: ./workflow-documentation.md
```

## Quick Start

### 1. Initialize
```bash
pixeldust init
```

### 2. Configure
Edit `.pixeldustrc.json`:
```json
{
  "framework": {
    "name": "@ui5/webcomponents",
    "versions": ["1.24.0", "2.0.0"]
  },
  "application": {
    "path": "./my-app",
    "port": 8080
  },
  "containers": {
    "runtime": "docker"
  },
  "ai": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-5-20250929"
  }
}
```

### 3. Set API Key
```bash
export ANTHROPIC_API_KEY="your-api-key"
```

### 4. Run Tests
```bash
pixeldust test
```

### 5. Review Results
```bash
# List sessions
pixeldust list

# View AI feedback and recommendations
pixeldust show-evaluation <session-id>

# Open interactive diff viewer
pixeldust show-diff <session-id>

# Generate HTML report
pixeldust report <session-id> --format html

# Approve and implement fix
pixeldust approve <session-id> <remediation-id>
```

## Configuration

### Complete Configuration Schema

```typescript
interface Config {
  framework: {
    name: string;                     // Framework package name
    versions: string[];               // Versions to compare
  };

  application?: {
    path: string;                     // Path to your application
    buildCommand: string;             // e.g., "npm run build"
    startCommand: string;             // e.g., "npm start"
    port: number;                     // Application port
    testPaths?: string[];             // Test file patterns
    sourcePaths?: string[];           // Source file patterns for scanning
  };

  components?: {
    include?: string[];               // Manually specify components (optional)
    exclude?: string[];               // Components to skip
  };

  containers: {
    runtime: 'podman' | 'docker';     // Container runtime
    baseImage: string;                // e.g., 'node:18-alpine'
    resources: {
      memory: string;                 // e.g., '4g'
      cpu: number;                    // CPU cores
    };
  };

  testing: {
    browsers: ('chromium' | 'firefox' | 'webkit')[];
    viewport: { width: number; height: number; };
    timeout: number;                  // Test timeout (ms)
    retries: number;                  // Retry attempts
    headless?: boolean;               // Headless mode
  };

  analysis: {
    visualThreshold: number;          // 0-1, pixel difference tolerance
    domIgnoreAttributes?: string[];   // Attributes to ignore in DOM diff
    performanceThresholds?: {
      fcp: number;                    // First Contentful Paint limit
      lcp: number;                    // Largest Contentful Paint limit
      tti: number;                    // Time to Interactive limit
    };
  };

  ai: {
    provider: 'anthropic' | 'openai';
    model: string;
    temperature?: number;             // 0-1, default: 0.7
    maxTokens?: number;               // Max response tokens
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

  upgrade?: {
    updatePeerDependencies: boolean;
    resolveConflicts: 'auto' | 'manual';
    fixTests: boolean;
    createBranches: boolean;
  };
}
```

## CLI Commands

### Core Commands

| Command | Description |
|---------|-------------|
| `pixeldust init` | Initialize configuration file |
| `pixeldust test` | Run version testing |
| `pixeldust resume <id>` | Resume interrupted session |
| `pixeldust list` | List all sessions |

### Discovery Commands

| Command | Description |
|---------|-------------|
| `pixeldust discover-workflows` | Standalone workflow discovery and documentation |

### Viewing Results

| Command | Description |
|---------|-------------|
| `pixeldust show-evaluation <id>` | View AI feedback and recommendations |
| `pixeldust show-diff <id>` | Open interactive web-based diff viewer |
| `pixeldust show-tests <id>` | View/export generated test code |
| `pixeldust report <id>` | Generate comprehensive report |

### Managing Remediations

| Command | Description |
|---------|-------------|
| `pixeldust approve <id> <rem-id>` | Approve and implement remediation |

### Command Cheat Sheet

```bash
# Setup
pixeldust init
export ANTHROPIC_API_KEY="sk-..."
npx playwright install chromium

# Discover
pixeldust discover-workflows --url http://localhost:3000
pixeldust discover-workflows --config .pixeldustrc.json
pixeldust discover-workflows --url http://localhost:3000 --output ./workflows.md --format markdown

# Run
pixeldust test
pixeldust test --config custom.json
pixeldust test --versions 1.24.0,2.0.0

# Review
pixeldust list
pixeldust show-evaluation <id>
pixeldust show-diff <id>
pixeldust report <id> --format html

# Manage
pixeldust resume <id>
pixeldust approve <id> <rem-id>
```

See full CLI documentation in [CLI.md](./CLI.md).

## Examples

### Example 1: Framework Upgrade

```bash
# Test UI5 1.x → 2.x upgrade
pixeldust init
vim .pixeldustrc.json  # Configure versions

pixeldust test
pixeldust show-evaluation <session-id>
pixeldust approve <session-id> <remediation-id>
pixeldust report <session-id> --format html
```

### Example 2: Application Migration

```json
{
  "framework": {
    "name": "@ui5/webcomponents",
    "versions": ["1.24.0", "2.16.0"]
  },
  "application": {
    "path": "./my-dashboard-app",
    "buildCommand": "npm run build",
    "startCommand": "npm start",
    "port": 3000
  }
}
```

**What Happens:**
1. ✅ Discovers 12 pages, 8 workflows, 15 components automatically
2. ✅ Generates 120 workflow-aware tests
3. ✅ Identifies 23 breaking changes
4. ✅ Proposes 18 fixes with 85% avg confidence
5. ✅ Upgrades dependencies and fixes tests automatically
6. ✅ All tests pass after 2 iterations

### Example 3: Component Discovery

No need to manually specify components! PixelDust automatically:

**Scans source code:**
```typescript
// Detects from imports
import "@ui5/webcomponents/dist/Button.js";
import { Table, Input } from "@ui5/webcomponents";

// Detects from usage
<ui5-button>Click</ui5-button>
<ui5-table></ui5-table>
```

**Scans running application:**
```
Workflow Discovery Results:
- ui5-button: 5 pages, 12 instances
- ui5-table: 2 pages, 3 instances
- ui5-input: 4 pages, 8 instances
```

**Combines both sources:**
```
Final Component List (automatically discovered):
✅ ui5-button
✅ ui5-table
✅ ui5-input
✅ ui5-card
✅ ui5-dialog
```

### Example 4: React Application Upgrade

Test React 17 → 18 migration with automatic dependency handling:

```json
{
  "framework": {
    "name": "react",
    "versions": ["17.0.2", "18.2.0"]
  },
  "application": {
    "path": "./my-react-app",
    "buildCommand": "npm run build",
    "startCommand": "npm start",
    "port": 3000
  },
  "upgrade": {
    "updatePeerDependencies": true,
    "resolveConflicts": "auto"
  }
}
```

**What PixelDust Does Automatically:**
- ✅ Upgrades `react` from 17.0.2 → 18.2.0
- ✅ Upgrades `react-dom` to matching version (18.2.0)
- ✅ Updates `@types/react` and `@types/react-dom`
- ✅ Detects React components from JSX/TSX files
- ✅ Generates tests for React 18 breaking changes (createRoot, etc.)
- ✅ Tests concurrent features and new Hooks

**Component Detection:**
```tsx
// Detects from imports
import { useState, useEffect } from 'react';
import { Button, Input } from './components';

// Detects from JSX usage
<Button variant="primary">Submit</Button>
<Input placeholder="Email" />
```

### Example 5: UI5 React Migration

Migrate UI5 React components with dual framework management:

```json
{
  "framework": {
    "name": "@ui5/webcomponents-react",
    "versions": ["1.0.0", "2.0.0"],
    "relatedPackages": ["react", "react-dom", "@ui5/webcomponents"]
  },
  "application": {
    "path": "./ui5-react-app",
    "buildCommand": "npm run build",
    "startCommand": "npm start",
    "port": 8080
  }
}
```

**Dual Framework Management:**
- 🎯 Manages `@ui5/webcomponents-react` upgrade
- 🔄 Ensures compatible `@ui5/webcomponents` version
- ⚛️ Maintains React/React-DOM compatibility
- 📦 Resolves peer dependencies across all packages

**Component Detection:**
```tsx
import { Button, Input, Table } from '@ui5/webcomponents-react';

<Button design="Emphasized">Submit</Button>
<Input placeholder="Name" />
<Table columns={[...]} />
```

## Advanced Usage

### CI/CD Integration

```yaml
# .github/workflows/pixeldust.yml
name: UI Version Testing

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3

      - name: Install PixelDust
        run: npm install -g @pixeldust/ui-version-tester

      - name: Install Playwright
        run: npx playwright install chromium

      - name: Run Version Tests
        run: pixeldust test --skip-browser-check
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

      - name: Upload Reports
        uses: actions/upload-artifact@v3
        with:
          name: pixeldust-reports
          path: ./reports
```

### Programmatic API

```typescript
import { OrchestratorAgent } from '@pixeldust/ui-version-tester';
import { DatabaseManager } from '@pixeldust/ui-version-tester/storage';

const db = new DatabaseManager();
const orchestrator = new OrchestratorAgent(db);

const session = {
  id: 'custom-session',
  state: SessionState.IDLE,
  config: myConfig,
  versions: ['1.24.0', '2.0.0'],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const result = await orchestrator.execute({
  session,
  config: myConfig
});
```

## Requirements

- **Node.js** >= 18.0.0
- **Container Runtime**: Docker or Podman
  - Docker: Standard installation
  - Podman: Rootless or rootful with socket enabled ([guide](./PODMAN.md))
- **API Key**: Anthropic (recommended) or OpenAI
- **Playwright**: Browsers auto-installed on first run

## Documentation

- 📘 [Architecture](./ARCHITECTURE.md) - System design and agent details
- 🏗️ [Hybrid Architecture](./HYBRID_ARCHITECTURE.md) - Pipeline + Event system
- 🐳 [Podman Setup](./PODMAN.md) - Rootless container configuration
- 💻 [CLI Reference](./CLI.md) - Complete command documentation
- 🤝 [Contributing](./CONTRIBUTING.md) - Contribution guidelines

## Roadmap

### v0.2.0 (Current) ✅

**Core System:**
- [x] 13 specialized AI agents
- [x] Hybrid architecture (Pipeline + Events)
- [x] Native Podman support

**Application-Aware Testing:**
- [x] **Phase 1**: Application-context test generation
- [x] **Phase 2**: Automatic workflow discovery
- [x] Automatic component discovery from source
- [x] Component-to-page mapping
- [x] Usage pattern detection

**Full Automation:**
- [x] Automatic dependency upgrades
- [x] AI-powered test fixing
- [x] Complete migration workflow
- [x] Continuous evaluation and feedback

### v0.3.0 (In Progress)

**Phase 3: Full Workflow Testing:**
- [ ] Multi-page workflow execution
- [ ] Application state verification
- [ ] End-to-end journey validation
- [ ] Data persistence testing

**Framework Support:**
- [x] React components (v0.2.0+)
- [x] UI5 Web Components for React (v0.2.0+)
- [ ] Vue components
- [ ] Angular components

**Tooling:**
- [ ] VS Code extension
- [ ] Cursor extension

### v0.4.0 (Planned)

- [ ] Cloud deployment options
- [ ] Real browser testing (BrowserStack/Sauce Labs)
- [ ] Collaborative features (team workflows)
- [ ] Advanced CI/CD integration
- [ ] Performance optimization
- [ ] Multi-framework comparison

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for:
- Development setup
- Coding standards
- Pull request process
- Adding new agents
- Testing guidelines

## License

MIT License - see [LICENSE](./LICENSE)

## Support

- 📚 [Documentation](./docs)
- 🐛 [Issue Tracker](https://github.com/pixeldust/pixeldust/issues)
- 💬 [Discussions](https://github.com/pixeldust/pixeldust/discussions)
- 📧 Email: support@pixeldust.dev

## Acknowledgments

Built with:
- [Anthropic Claude](https://anthropic.com) - AI-powered analysis and remediation
- [Playwright](https://playwright.dev) - Cross-browser testing
- [Docker](https://docker.com) / [Podman](https://podman.io) - Container orchestration
- [TypeScript](https://typescriptlang.org) - Type-safe development

---

**Made with ❤️ for the developer community**

**PixelDust**: Intelligent UI version testing that understands your application.
