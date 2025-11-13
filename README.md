# PixelDust - Agentic UI Version Testing System

An intelligent, multi-agent system for automated UI version testing, visual regression detection, and autonomous remediation.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)

## Overview

PixelDust is an AI-powered testing system that automatically:
- ✅ Spins up isolated environments for each framework version (Docker **or Podman**)
- 🤖 Generates comprehensive Playwright tests using AI
- 📸 Captures screenshots for visual regression testing
- 🔍 Performs detailed DOM and performance comparisons
- 💡 Proposes intelligent remediations for breaking changes
- 🔧 Autonomously implements approved fixes
- 🔄 Iterates until all tests pass

**🚀 Native Podman Support:** Full rootless and rootful Podman support with automatic socket detection. See [PODMAN.md](./PODMAN.md) for details.

## Capabilities

### 🎯 Two Modes of Operation

**1. Framework-Only Mode** (Quick evaluation)
- Tests UI framework components in isolation
- Fast comparison between versions
- Ideal for evaluating upgrades before starting

**2. Application Mode** (Full automated migration) ⭐ NEW
- Tests YOUR actual application code
- Automatically upgrades dependencies
- AI-powered test fixing
- Complete end-to-end migration

### ✅ What PixelDust Does (v0.2.0)

**Core Features:**
- ✅ **Application Integration**: Mount and test your real application code
- ✅ **Automatic Dependency Upgrade**: Updates package.json and resolves peer dependencies
- ✅ **AI-Powered Test Fixing**: Automatically fixes broken tests after framework upgrades
- ✅ **Breaking Change Detection**: Visual, DOM, API, and performance differences
- ✅ **Intelligent Remediation**: AI proposes code fixes with confidence scores
- ✅ **Visual Regression**: Pixel-perfect comparison with detailed diffs
- ✅ **Multi-Agent System**: 12 specialized agents working together
- ✅ **Hybrid Architecture**: Pipeline-based workflow with event-driven monitoring
- ✅ **Continuous Improvement**: Evaluation agent provides feedback after each session
- ✅ **Real-Time Feedback**: Streaming progress and quality alerts during execution
- ✅ **Interactive Diff Viewer**: Browser-based UI for reviewing comparisons
- ✅ **Native Podman Support**: Rootless containers for enhanced security

**Complete Workflow:**
1. 📦 Load your application into containers
2. 🔄 Test with multiple framework versions
3. 🔍 Analyze differences (visual + functional)
4. ⬆️  Upgrade dependencies automatically
5. 🔧 Fix broken tests with AI
6. ✅ Verify everything works
7. 📊 Generate comprehensive reports

## Architecture

### Hybrid Architecture: Pipeline Core + Event Layer

PixelDust uses a **Hybrid Architecture** combining:
- **Pipeline Layer**: Structured workflow execution with clear dependencies
- **Event Layer**: Real-time monitoring, evaluation, and feedback

See [HYBRID_ARCHITECTURE.md](./HYBRID_ARCHITECTURE.md) for detailed documentation.

```
┌─────────────────────────────────────────────────────────────┐
│                      PIPELINE LAYER                          │
│  [Discover] → [Generate] → [Execute] → [Analyze] → [Eval]  │
│       │           │            │           │                 │
│       └───────────┴────────────┴───────────┘                │
│                    │ (Emits events)                          │
└────────────────────┼─────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                       EVENT LAYER                            │
│  Event Bus → [Continuous Evaluation] [Metrics] [Alerts]    │
└─────────────────────────────────────────────────────────────┘
```

### Traditional View

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
│  │         HYBRID ORCHESTRATOR (Pipeline + Events)              │  │
│  │  • Executes pipeline stages in dependency order             │  │
│  │  • Emits events for real-time monitoring                    │  │
│  │  • Enables continuous evaluation                            │  │
│  └──────────────────────────────────────────────────────────────┘  │
│         │              │              │              │               │
│    ┌────┴────┐    ┌────┴────┐   ┌────┴────┐   ┌────┴────┐         │
│    ▼         ▼    ▼         ▼   ▼         ▼   ▼         ▼         │
│  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐   │
│  │Env  │  │Test │  │Exec │  │Analy│  │Remed│  │Impl │  │Review│   │
│  │Agent│  │Gen  │  │Agent│  │sis  │  │Agent│  │Agent│  │Agent │   │
│  │     │  │Agent│  │     │  │Agent│  │     │  │     │  │     │   │
│  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture documentation.

## Features

### 🤖 Multi-Agent System
- **Orchestrator Agent**: Coordinates the entire testing lifecycle
- **Environment Agent**: Manages containerized test environments
- **Test Generation Agent**: AI-powered test creation
- **Execution Agent**: Parallel test execution with Playwright
- **Analysis Agent**: Multi-dimensional comparison (visual, DOM, performance)
- **Remediation Agent**: Intelligent fix proposals
- **Implementation Agent**: Autonomous code changes
- **Review Agent**: Post-implementation verification

### 🔍 Comprehensive Analysis
- **Visual Comparison**: Pixel-perfect + perceptual diffing
- **DOM Comparison**: Structural and semantic analysis
- **Performance Metrics**: FCP, LCP, TTI tracking
- **Accessibility**: ARIA attributes and a11y tree comparison

### 🎯 Intelligent Remediation
- AI-powered root cause analysis
- Multiple solution proposals with confidence scores
- Impact assessment and effort estimation
- Automated implementation with Git integration

### 📊 Rich Reporting
- Markdown, HTML, and JSON formats
- Visual diff images
- Detailed change logs
- Sign-off workflows

## Installation

```bash
npm install -g @pixeldust/ui-version-tester
```

Or use it locally in your project:

```bash
npm install --save-dev @pixeldust/ui-version-tester
```

## Quick Start

### 1. Initialize Configuration

```bash
pixeldust init
```

This creates a `.pixeldustrc.json` file in your project root.

### 2. Configure Your Test

Edit `.pixeldustrc.json`:

```json
{
  "framework": {
    "name": "@ui5/webcomponents",
    "versions": ["1.0.0", "2.0.0"]
  },
  "containers": {
    "runtime": "docker",
    "baseImage": "node:18-alpine",
    "resources": {
      "memory": "2g",
      "cpu": 2
    }
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
# List all sessions
pixeldust list

# View report
pixeldust report <session-id>

# View evaluation feedback and recommendations
pixeldust show-evaluation <session-id>

# Open interactive diff viewer in browser
pixeldust show-diff <session-id>

# Approve a remediation
pixeldust approve <session-id> <remediation-id>
```

## CLI Commands

PixelDust provides a comprehensive command-line interface for managing UI version testing workflows.

### `pixeldust init`
Initialize a new PixelDust configuration file.

Creates a `.pixeldustrc.json` file in the current directory with default settings.

**Options:**
- `-f, --force`: Overwrite existing configuration

**Examples:**
```bash
# Create new configuration
pixeldust init

# Force overwrite existing configuration
pixeldust init --force
```

### `pixeldust test`
Run UI version testing for the configured framework versions.

**Options:**
- `-c, --config <path>`: Path to configuration file (default: searches for .pixeldustrc.json)
- `-v, --versions <versions>`: Comma-separated list of versions to test (overrides config)
- `--skip-browser-check`: Skip Playwright browser installation check

**Examples:**
```bash
# Run with default configuration
pixeldust test

# Use specific config file
pixeldust test --config ./configs/ui5-test.json

# Test specific versions only
pixeldust test --versions 1.24.0,2.0.0,2.16.0

# Skip browser check (useful in CI/CD)
pixeldust test --skip-browser-check
```

**Prerequisites:**
- Playwright browsers must be installed: `npx playwright install chromium`
- ANTHROPIC_API_KEY or OPENAI_API_KEY must be set

### `pixeldust resume <session-id>`
Resume a previous testing session from where it left off.

Useful when a session is interrupted or requires manual intervention.

**Arguments:**
- `<session-id>`: The UUID of the session to resume

**Examples:**
```bash
# Resume a specific session
pixeldust resume abc123-def456-ghi789

# Find session ID first, then resume
pixeldust list
pixeldust resume 550e8400-e29b-41d4-a716-446655440000
```

### `pixeldust list`
List all testing sessions with their current state and metadata.

**Options:**
- `-n, --limit <number>`: Maximum number of sessions to display (default: 10)

**Examples:**
```bash
# Show last 10 sessions
pixeldust list

# Show last 50 sessions
pixeldust list --limit 50
```

**Output:**
```
Recent Sessions:

ID                                   | State              | Versions | Created
----------------------------------------------------------------------------------------------------
550e8400-e29b-41d4-a716-446655440000 | COMPLETED          | 1.24.0,2 | 2025-11-13
6ba7b810-9dad-11d1-80b4-00c04fd430c8 | FAILED             | 2.0.0,2. | 2025-11-12
```

### `pixeldust report <session-id>`
Generate a comprehensive report for a completed session.

**Arguments:**
- `<session-id>`: The UUID of the session

**Options:**
- `-f, --format <format>`: Report format - `markdown`, `html`, or `json` (default: markdown)

**Examples:**
```bash
# Generate markdown report
pixeldust report abc123-def456

# Generate HTML report
pixeldust report abc123-def456 --format html

# Generate JSON report for programmatic use
pixeldust report abc123-def456 --format json
```

**Output:**
Reports are saved to the configured `reporting.outputPath` directory.

### `pixeldust show-tests <session-id>`
Display or export the generated Playwright test code from a session.

**Arguments:**
- `<session-id>`: The UUID of the session

**Options:**
- `-c, --component <component>`: Filter tests by component name
- `-e, --export <path>`: Export tests to a directory instead of displaying

**Examples:**
```bash
# Show all generated tests
pixeldust show-tests abc123-def456

# Show tests for specific component
pixeldust show-tests abc123-def456 --component ui5-button

# Export all tests to files
pixeldust show-tests abc123-def456 --export ./playwright-tests

# Export tests for specific component
pixeldust show-tests abc123-def456 --component ui5-button --export ./tests
```

**Output Structure (when using --export):**
```
./playwright-tests/
├── ui5-button/
│   ├── functional-1.spec.ts
│   ├── visual-1.spec.ts
│   └── accessibility-1.spec.ts
├── ui5-input/
│   ├── functional-1.spec.ts
│   └── visual-1.spec.ts
```

### `pixeldust show-evaluation <session-id>`
Display detailed evaluation feedback and recommendations from the AI analysis.

Shows test quality metrics, comparison quality, strengths, weaknesses, and actionable recommendations for improvement.

**Arguments:**
- `<session-id>`: The UUID of the session

**Examples:**
```bash
# View evaluation for a session
pixeldust show-evaluation abc123-def456
```

**Output Includes:**
- Overall quality score
- Test quality metrics (success rate, coverage, duration)
- Comparison quality metrics (precision, recall, accuracy)
- Remediation effectiveness (if applicable)
- Strengths and weaknesses analysis
- Prioritized recommendations
- Prompt improvement suggestions
- Configuration suggestions

### `pixeldust show-diff <session-id>`
Launch an interactive web-based diff viewer to explore visual and DOM differences.

**Arguments:**
- `<session-id>`: The UUID of the session

**Options:**
- `-p, --port <port>`: Port to run web server on (default: 3000)
- `--no-open`: Don't open browser automatically

**Examples:**
```bash
# Start diff viewer (opens browser automatically)
pixeldust show-diff abc123-def456

# Use custom port
pixeldust show-diff abc123-def456 --port 8080

# Start server without opening browser
pixeldust show-diff abc123-def456 --no-open
```

**Features:**
- Side-by-side visual comparison with slider
- DOM diff viewer with syntax highlighting
- Screenshot carousel with zoom
- Filter by version, component, or test
- Export individual comparisons

**Controls:**
- Press `Ctrl+C` to stop the server

### `pixeldust approve <session-id> <remediation-id>`
Approve a specific remediation proposal and continue with implementation.

Once approved, the system will automatically apply the remediation, commit changes, and re-run tests.

**Arguments:**
- `<session-id>`: The UUID of the session
- `<remediation-id>`: The ID of the remediation to approve

**Examples:**
```bash
# Approve a remediation
pixeldust approve abc123-def456 rem-789

# View remediations first, then approve
pixeldust show-evaluation abc123-def456
pixeldust approve abc123-def456 rem-specific-id
```

**What Happens After Approval:**
1. System creates a feature branch
2. Applies the remediation code changes
3. Commits changes with descriptive message
4. Re-runs tests to verify the fix
5. Reports results

---

## Command Cheat Sheet

```bash
# Initial Setup
pixeldust init                              # Create config file
export ANTHROPIC_API_KEY="sk-..."          # Set API key
npx playwright install chromium             # Install browsers

# Run Tests
pixeldust test                              # Run with default config
pixeldust test -v 1.24.0,2.0.0             # Test specific versions
pixeldust test -c custom-config.json       # Use custom config

# View Results
pixeldust list                              # List all sessions
pixeldust show-evaluation <session-id>      # View AI feedback
pixeldust show-diff <session-id>            # Open web diff viewer
pixeldust show-tests <session-id>           # View generated tests
pixeldust report <session-id> -f html       # Generate HTML report

# Work with Sessions
pixeldust resume <session-id>               # Resume interrupted session
pixeldust approve <session-id> <rem-id>     # Approve remediation

# Export
pixeldust show-tests <sid> -e ./tests       # Export test files
pixeldust report <sid> -f json > out.json   # Export JSON report
```

## Configuration

### Full Configuration Schema

```typescript
interface Config {
  framework: {
    name: string;                // e.g., 'ui5-webcomponents'
    versions: string[];          // e.g., ['1.0.0', '2.0.0']
  };

  components?: {
    include?: string[];          // Specific components to test
    exclude?: string[];          // Components to skip
  };

  containers: {
    runtime: 'podman' | 'docker';
    baseImage: string;           // e.g., 'node:18-alpine'
    resources: {
      memory: string;            // e.g., '2g'
      cpu: number;               // Number of CPU cores
    };
  };

  testing: {
    browsers: ('chromium' | 'firefox' | 'webkit')[];
    viewport: { width: number; height: number; };
    timeout: number;             // Milliseconds
    retries: number;
    headless?: boolean;
  };

  analysis: {
    visualThreshold: number;     // 0-1, pixel difference tolerance
    domIgnoreAttributes?: string[];
    performanceThresholds?: {
      fcp: number;               // First Contentful Paint
      lcp: number;               // Largest Contentful Paint
      tti: number;               // Time to Interactive
    };
  };

  ai: {
    provider: 'anthropic' | 'openai';
    model: string;
    apiKey?: string;             // Or use environment variable
    temperature?: number;
    maxTokens?: number;
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

## Workflow

### 1. **Initialization**
The system validates configuration and creates a new session.

### 2. **Environment Setup**
Spins up isolated containers for each version using Docker/Podman.

### 3. **Test Generation**
AI analyzes your components and generates comprehensive test suites covering:
- Functional testing
- Visual regression
- Accessibility
- Performance

### 4. **Test Execution**
Runs tests in parallel across all versions and browsers, capturing:
- Screenshots at key interaction points
- DOM snapshots
- Performance metrics

### 5. **Analysis**
Compares results across versions to detect:
- Visual differences
- DOM structure changes
- Performance regressions
- Accessibility issues

### 6. **Remediation**
AI analyzes differences and proposes fixes with:
- Root cause analysis
- Multiple solution options
- Confidence scores
- Impact assessment

### 7. **Approval**
User reviews and approves proposed remediations.

### 8. **Implementation**
System automatically:
- Creates feature branches
- Applies code changes
- Commits and tags changes

### 9. **Review**
Re-runs tests to verify fixes and ensure no regressions.

### 10. **Sign-off**
User reviews final results and signs off on the migration.

## Examples

### Testing UI5 Web Components Upgrade

```bash
# Initialize
pixeldust init

# Edit config to test UI5 1.x → 2.x
vim .pixeldustrc.json

# Run test
pixeldust test

# Review proposals
pixeldust list

# Approve and implement
pixeldust approve <session-id> <remediation-id>

# Generate final report
pixeldust report <session-id> --format html
```

### Custom Component Testing

```json
{
  "framework": {
    "name": "@ui5/webcomponents",
    "versions": ["1.24.0", "2.0.0"]
  },
  "components": {
    "include": ["ui5-button", "ui5-input", "ui5-card"]
  }
}
```

## VS Code Extension (Coming Soon)

```typescript
// Install extension
// Open Command Palette (Cmd+Shift+P)
// Search: "PixelDust: Start Version Test"
// Select versions and start testing
```

## Advanced Usage

### Custom Test Generation

You can provide your own test templates or seed prompts to guide AI test generation.

### CI/CD Integration

```yaml
# .github/workflows/version-test.yml
name: Version Testing

on: [push]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install -g @pixeldust/ui-version-tester
      - run: pixeldust test --versions 1.0.0,2.0.0
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

### API Usage

```typescript
import { OrchestratorAgent } from '@pixeldust/ui-version-tester';
import { DatabaseManager } from '@pixeldust/ui-version-tester/storage';

const db = new DatabaseManager();
const orchestrator = new OrchestratorAgent(db);

const session = {
  id: 'my-session',
  state: SessionState.IDLE,
  config: myConfig,
  versions: ['1.0.0', '2.0.0'],
  createdAt: new Date(),
  updatedAt: new Date(),
};

await orchestrator.execute({ session, config: myConfig });
```

## Requirements

- Node.js >= 18.0.0
- **Container Runtime:** Docker or Podman (native support for both)
  - Docker: Standard installation
  - Podman: Rootless or rootful with socket enabled ([setup guide](./PODMAN.md))
- Anthropic API key (or OpenAI API key)

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Support

- 📚 [Documentation](./docs)
- 🐛 [Issue Tracker](https://github.com/pixeldust/pixeldust/issues)
- 💬 [Discussions](https://github.com/pixeldust/pixeldust/discussions)

## Roadmap

### v0.2.0 (Current) ✅
- [x] Core multi-agent architecture (11 agents)
- [x] UI5 web components support
- [x] Docker/Podman native integration
- [x] Visual regression testing
- [x] AI-powered remediation
- [x] **Application integration** (ApplicationLoaderAgent)
- [x] **Automatic dependency upgrades** (DependencyUpgradeAgent)
- [x] **AI-powered test fixing** (TestFixingAgent)
- [x] **Full automated migration workflow**

### v0.3.0 (Planned)
- [ ] VS Code extension
- [ ] Cursor extension
- [ ] React support
- [ ] Vue support
- [ ] Angular support

### v0.4.0 (Future)
- [ ] Cloud deployment options
- [ ] Real browser testing (BrowserStack)
- [ ] Collaborative features
- [ ] CI/CD deep integration

## Acknowledgments

Built with:
- [Anthropic Claude](https://anthropic.com) - AI-powered analysis and remediation
- [Playwright](https://playwright.dev) - Cross-browser testing
- [Docker](https://docker.com) - Container orchestration
- [TypeScript](https://typescriptlang.org) - Type-safe development

---

**Made with ❤️ by the PixelDust Team**
