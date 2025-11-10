![helix-architecture](https://github.com/user-attachments/assets/8941f4c1-195b-4d01-a2cc-b8232f80d512)# PixelDust - Agentic UI Version Testing System

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
- ✅ **Multi-Agent System**: 11 specialized agents working together
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

![Uploading helix-architecture.svg…]<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 900">
  <defs>
    <!-- Gradients -->
    <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
    
    <linearGradient id="orchestratorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#f093fb;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#f5576c;stop-opacity:1" />
    </linearGradient>
    
    <linearGradient id="triggerGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#4facfe;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#00f2fe;stop-opacity:1" />
    </linearGradient>
    
    <linearGradient id="agentGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#43e97b;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#38f9d7;stop-opacity:1" />
    </linearGradient>
    
    <!-- Shadows -->
    <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
      <feOffset dx="0" dy="2" result="offsetblur"/>
      <feComponentTransfer>
        <feFuncA type="linear" slope="0.3"/>
      </feComponentTransfer>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  
  <!-- Background -->
  <rect width="1400" height="900" fill="#0f0f23"/>
  
  <!-- Main Container -->
  <rect x="50" y="40" width="1300" height="820" rx="20" fill="#1a1a2e" stroke="#667eea" stroke-width="2" filter="url(#shadow)"/>
  
  <!-- Header -->
  <rect x="50" y="40" width="1300" height="80" rx="20" fill="url(#headerGrad)" filter="url(#shadow)"/>
  <text x="700" y="85" font-family="'Segoe UI', Arial, sans-serif" font-size="32" font-weight="bold" fill="white" text-anchor="middle">
    AGENTIC UI TESTING SYSTEM
  </text>
  
  <!-- Trigger Layer Container -->
  <rect x="100" y="160" width="1200" height="140" rx="15" fill="#16213e" stroke="#4facfe" stroke-width="2" filter="url(#shadow)"/>
  <text x="700" y="190" font-family="'Segoe UI', Arial, sans-serif" font-size="20" font-weight="600" fill="#4facfe" text-anchor="middle">
    TRIGGER LAYER
  </text>
  
  <!-- CLI Interface -->
  <g filter="url(#shadow)">
    <rect x="180" y="210" width="280" height="70" rx="10" fill="url(#triggerGrad)"/>
    <text x="320" y="240" font-family="'Segoe UI', Arial, sans-serif" font-size="18" font-weight="600" fill="white" text-anchor="middle">
      CLI Interface
    </text>
    <text x="320" y="265" font-family="'Segoe UI', Arial, sans-serif" font-size="14" fill="#e0e0e0" text-anchor="middle">
      Command Line Tool
    </text>
  </g>
  
  <!-- VS Code Extension -->
  <g filter="url(#shadow)">
    <rect x="560" y="210" width="280" height="70" rx="10" fill="url(#triggerGrad)"/>
    <text x="700" y="240" font-family="'Segoe UI', Arial, sans-serif" font-size="18" font-weight="600" fill="white" text-anchor="middle">
      VS Code Extension
    </text>
    <text x="700" y="265" font-family="'Segoe UI', Arial, sans-serif" font-size="14" fill="#e0e0e0" text-anchor="middle">
      IDE Integration
    </text>
  </g>
  
  <!-- Cursor Extension -->
  <g filter="url(#shadow)">
    <rect x="940" y="210" width="280" height="70" rx="10" fill="url(#triggerGrad)"/>
    <text x="1080" y="240" font-family="'Segoe UI', Arial, sans-serif" font-size="18" font-weight="600" fill="white" text-anchor="middle">
      Cursor Extension
    </text>
    <text x="1080" y="265" font-family="'Segoe UI', Arial, sans-serif" font-size="14" fill="#e0e0e0" text-anchor="middle">
      IDE Integration
    </text>
  </g>
  
  <!-- Connection Line from Triggers to Orchestrator -->
  <path d="M 700 300 L 700 350" stroke="#667eea" stroke-width="3" fill="none" marker-end="url(#arrowhead)"/>
  
  <!-- Arrow marker -->
  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
      <polygon points="0 0, 10 3, 0 6" fill="#667eea" />
    </marker>
    <marker id="arrowhead-green" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
      <polygon points="0 0, 10 3, 0 6" fill="#43e97b" />
    </marker>
  </defs>
  
  <!-- Orchestrator Agent -->
  <g filter="url(#shadow)">
    <rect x="300" y="350" width="800" height="120" rx="15" fill="url(#orchestratorGrad)"/>
    <text x="700" y="385" font-family="'Segoe UI', Arial, sans-serif" font-size="24" font-weight="bold" fill="white" text-anchor="middle">
      ORCHESTRATOR AGENT (Claude)
    </text>
    <text x="700" y="415" font-family="'Segoe UI', Arial, sans-serif" font-size="16" fill="white" text-anchor="middle">
      • Coordinates all agents
    </text>
    <text x="700" y="440" font-family="'Segoe UI', Arial, sans-serif" font-size="16" fill="white" text-anchor="middle">
      • Maintains state machine • Makes high-level decisions
    </text>
  </g>
  
  <!-- Connection Lines from Orchestrator to Agents -->
  <path d="M 375 470 L 230 540" stroke="#43e97b" stroke-width="2.5" fill="none" marker-end="url(#arrowhead-green)"/>
  <path d="M 475 470 L 400 540" stroke="#43e97b" stroke-width="2.5" fill="none" marker-end="url(#arrowhead-green)"/>
  <path d="M 575 470 L 570 540" stroke="#43e97b" stroke-width="2.5" fill="none" marker-end="url(#arrowhead-green)"/>
  <path d="M 700 470 L 700 540" stroke="#43e97b" stroke-width="2.5" fill="none" marker-end="url(#arrowhead-green)"/>
  <path d="M 825 470 L 830 540" stroke="#43e97b" stroke-width="2.5" fill="none" marker-end="url(#arrowhead-green)"/>
  <path d="M 925 470 L 1000 540" stroke="#43e97b" stroke-width="2.5" fill="none" marker-end="url(#arrowhead-green)"/>
  <path d="M 1025 470 L 1170 540" stroke="#43e97b" stroke-width="2.5" fill="none" marker-end="url(#arrowhead-green)"/>
  
  <!-- Agent Layer -->
  <!-- Environment Agent -->
  <g filter="url(#shadow)">
    <rect x="120" y="560" width="160" height="120" rx="12" fill="url(#agentGrad)"/>
    <text x="200" y="595" font-family="'Segoe UI', Arial, sans-serif" font-size="18" font-weight="600" fill="#0f0f23" text-anchor="middle">
      Environment
    </text>
    <text x="200" y="620" font-family="'Segoe UI', Arial, sans-serif" font-size="16" font-weight="600" fill="#0f0f23" text-anchor="middle">
      Agent
    </text>
    <text x="200" y="645" font-family="'Segoe UI', Arial, sans-serif" font-size="13" fill="#1a1a2e" text-anchor="middle">
      Setup & Config
    </text>
    <text x="200" y="665" font-family="'Segoe UI', Arial, sans-serif" font-size="13" fill="#1a1a2e" text-anchor="middle">
      Version Control
    </text>
  </g>
  
  <!-- Test Generation Agent -->
  <g filter="url(#shadow)">
    <rect x="310" y="560" width="160" height="120" rx="12" fill="url(#agentGrad)"/>
    <text x="390" y="595" font-family="'Segoe UI', Arial, sans-serif" font-size="18" font-weight="600" fill="#0f0f23" text-anchor="middle">
      Test Gen
    </text>
    <text x="390" y="620" font-family="'Segoe UI', Arial, sans-serif" font-size="16" font-weight="600" fill="#0f0f23" text-anchor="middle">
      Agent
    </text>
    <text x="390" y="645" font-family="'Segoe UI', Arial, sans-serif" font-size="13" fill="#1a1a2e" text-anchor="middle">
      Playwright Tests
    </text>
    <text x="390" y="665" font-family="'Segoe UI', Arial, sans-serif" font-size="13" fill="#1a1a2e" text-anchor="middle">
      Auto Generation
    </text>
  </g>
  
  <!-- Execution Agent -->
  <g filter="url(#shadow)">
    <rect x="500" y="560" width="160" height="120" rx="12" fill="url(#agentGrad)"/>
    <text x="580" y="595" font-family="'Segoe UI', Arial, sans-serif" font-size="18" font-weight="600" fill="#0f0f23" text-anchor="middle">
      Execution
    </text>
    <text x="580" y="620" font-family="'Segoe UI', Arial, sans-serif" font-size="16" font-weight="600" fill="#0f0f23" text-anchor="middle">
      Agent
    </text>
    <text x="580" y="645" font-family="'Segoe UI', Arial, sans-serif" font-size="13" fill="#1a1a2e" text-anchor="middle">
      Run Tests
    </text>
    <text x="580" y="665" font-family="'Segoe UI', Arial, sans-serif" font-size="13" fill="#1a1a2e" text-anchor="middle">
      Capture Results
    </text>
  </g>
  
  <!-- Analysis Agent -->
  <g filter="url(#shadow)">
    <rect x="690" y="560" width="160" height="120" rx="12" fill="url(#agentGrad)"/>
    <text x="770" y="595" font-family="'Segoe UI', Arial, sans-serif" font-size="18" font-weight="600" fill="#0f0f23" text-anchor="middle">
      Analysis
    </text>
    <text x="770" y="620" font-family="'Segoe UI', Arial, sans-serif" font-size="16" font-weight="600" fill="#0f0f23" text-anchor="middle">
      Agent
    </text>
    <text x="770" y="645" font-family="'Segoe UI', Arial, sans-serif" font-size="13" fill="#1a1a2e" text-anchor="middle">
      Visual Diff
    </text>
    <text x="770" y="665" font-family="'Segoe UI', Arial, sans-serif" font-size="13" fill="#1a1a2e" text-anchor="middle">
      DOM Compare
    </text>
  </g>
  
  <!-- Remediation Agent -->
  <g filter="url(#shadow)">
    <rect x="880" y="560" width="160" height="120" rx="12" fill="url(#agentGrad)"/>
    <text x="960" y="595" font-family="'Segoe UI', Arial, sans-serif" font-size="18" font-weight="600" fill="#0f0f23" text-anchor="middle">
      Remediation
    </text>
    <text x="960" y="620" font-family="'Segoe UI', Arial, sans-serif" font-size="16" font-weight="600" fill="#0f0f23" text-anchor="middle">
      Agent
    </text>
    <text x="960" y="645" font-family="'Segoe UI', Arial, sans-serif" font-size="13" fill="#1a1a2e" text-anchor="middle">
      Propose Fixes
    </text>
    <text x="960" y="665" font-family="'Segoe UI', Arial, sans-serif" font-size="13" fill="#1a1a2e" text-anchor="middle">
      Issue Detection
    </text>
  </g>
  
  <!-- Implementation Agent -->
  <g filter="url(#shadow)">
    <rect x="930" y="720" width="160" height="120" rx="12" fill="url(#agentGrad)"/>
    <text x="1010" y="755" font-family="'Segoe UI', Arial, sans-serif" font-size="18" font-weight="600" fill="#0f0f23" text-anchor="middle">
      Implementation
    </text>
    <text x="1010" y="780" font-family="'Segoe UI', Arial, sans-serif" font-size="16" font-weight="600" fill="#0f0f23" text-anchor="middle">
      Agent
    </text>
    <text x="1010" y="805" font-family="'Segoe UI', Arial, sans-serif" font-size="13" fill="#1a1a2e" text-anchor="middle">
      Apply Changes
    </text>
    <text x="1010" y="825" font-family="'Segoe UI', Arial, sans-serif" font-size="13" fill="#1a1a2e" text-anchor="middle">
      Code Updates
    </text>
  </g>
  
  <!-- Review Agent -->
  <g filter="url(#shadow)">
    <rect x="1120" y="560" width="160" height="120" rx="12" fill="url(#agentGrad)"/>
    <text x="1200" y="595" font-family="'Segoe UI', Arial, sans-serif" font-size="18" font-weight="600" fill="#0f0f23" text-anchor="middle">
      Review
    </text>
    <text x="1200" y="620" font-family="'Segoe UI', Arial, sans-serif" font-size="16" font-weight="600" fill="#0f0f23" text-anchor="middle">
      Agent
    </text>
    <text x="1200" y="645" font-family="'Segoe UI', Arial, sans-serif" font-size="13" fill="#1a1a2e" text-anchor="middle">
      User Approval
    </text>
    <text x="1200" y="665" font-family="'Segoe UI', Arial, sans-serif" font-size="13" fill="#1a1a2e" text-anchor="middle">
      Quality Check
    </text>
  </g>
  
  <!-- Workflow arrows between agents -->
  <path d="M 280 620 L 310 620" stroke="#f5576c" stroke-width="2" fill="none" stroke-dasharray="5,5" opacity="0.6"/>
  <path d="M 470 620 L 500 620" stroke="#f5576c" stroke-width="2" fill="none" stroke-dasharray="5,5" opacity="0.6"/>
  <path d="M 660 620 L 690 620" stroke="#f5576c" stroke-width="2" fill="none" stroke-dasharray="5,5" opacity="0.6"/>
  <path d="M 850 620 L 880 620" stroke="#f5576c" stroke-width="2" fill="none" stroke-dasharray="5,5" opacity="0.6"/>
  <path d="M 1040 620 L 1120 620" stroke="#f5576c" stroke-width="2" fill="none" stroke-dasharray="5,5" opacity="0.6"/>
  <path d="M 960 680 L 1010 720" stroke="#f5576c" stroke-width="2" fill="none" stroke-dasharray="5,5" opacity="0.6"/>
  
  <!-- Legend -->
  <g>
    <rect x="100" y="760" width="250" height="90" rx="10" fill="#16213e" stroke="#667eea" stroke-width="1.5" opacity="0.9"/>
    <text x="225" y="785" font-family="'Segoe UI', Arial, sans-serif" font-size="16" font-weight="600" fill="#667eea" text-anchor="middle">
      WORKFLOW
    </text>
    <line x1="120" y1="805" x2="160" y2="805" stroke="#43e97b" stroke-width="2.5"/>
    <text x="170" y="810" font-family="'Segoe UI', Arial, sans-serif" font-size="13" fill="#e0e0e0">
      Control Flow
    </text>
    <line x1="120" y1="830" x2="160" y2="830" stroke="#f5576c" stroke-width="2" stroke-dasharray="5,5"/>
    <text x="170" y="835" font-family="'Segoe UI', Arial, sans-serif" font-size="13" fill="#e0e0e0">
      Data Flow
    </text>
  </g>
  
  <!-- Decorative elements -->
  <circle cx="80" cy="80" r="5" fill="#4facfe" opacity="0.6" filter="url(#glow)"/>
  <circle cx="1320" cy="80" r="5" fill="#4facfe" opacity="0.6" filter="url(#glow)"/>
  <circle cx="80" cy="840" r="5" fill="#43e97b" opacity="0.6" filter="url(#glow)"/>
  <circle cx="1320" cy="840" r="5" fill="#43e97b" opacity="0.6" filter="url(#glow)"/>
</svg>()


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
│  │         ORCHESTRATOR AGENT (Claude)                          │  │
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
    "name": "ui5-webcomponents",
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

# Approve a remediation
pixeldust approve <session-id> <remediation-id>
```

## CLI Commands

### `pixeldust init`
Initialize a new PixelDust configuration file.

**Options:**
- `-f, --force`: Overwrite existing configuration

**Example:**
```bash
pixeldust init --force
```

### `pixeldust test`
Run UI version testing.

**Options:**
- `-c, --config <path>`: Path to configuration file
- `-v, --versions <versions>`: Comma-separated list of versions

**Example:**
```bash
pixeldust test --versions 1.0.0,2.0.0,3.0.0
```

### `pixeldust resume <session-id>`
Resume a previous testing session.

**Example:**
```bash
pixeldust resume abc123-def456-ghi789
```

### `pixeldust list`
List all testing sessions.

**Options:**
- `-n, --limit <number>`: Number of sessions to show (default: 10)

**Example:**
```bash
pixeldust list --limit 20
```

### `pixeldust report <session-id>`
Generate a report for a session.

**Options:**
- `-f, --format <format>`: Report format (markdown, html, json)

**Example:**
```bash
pixeldust report abc123 --format html
```

### `pixeldust approve <session-id> <remediation-id>`
Approve a remediation proposal and continue implementation.

**Example:**
```bash
pixeldust approve abc123 rem456
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
    "name": "ui5-webcomponents",
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
