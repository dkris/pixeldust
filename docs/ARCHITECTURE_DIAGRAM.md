# PixelDust Architecture Diagrams

This document contains visual representations of the PixelDust architecture using Mermaid diagrams. These diagrams can be rendered in GitHub, GitLab, and many documentation tools.

## System Overview

```mermaid
graph TB
    subgraph "User Interfaces"
        CLI[CLI Interface]
        VSCode[VS Code Extension]
        Cursor[Cursor Extension]
    end

    subgraph "Orchestration Layer"
        Orch[Orchestrator Agent]
        SM[State Machine]
        EB[Event Bus]
        Pipeline[Pipeline Manager]
    end

    subgraph "Discovery Phase"
        AppLoader[Application Loader]
        Env[Environment Agent]
        WfDiscovery[Workflow Discovery]
        CompScanner[Component Scanner]
    end

    subgraph "Testing Phase"
        TestGen[Test Generation]
        Exec[Execution Agent]
        Perf[Performance Metrics]
    end

    subgraph "Analysis Phase"
        Analysis[Analysis Agent]
        Visual[Visual Diff]
        DOM[DOM Comparison]
        A11y[Accessibility Check]
    end

    subgraph "Remediation Phase"
        Remed[Remediation Agent]
        DepUp[Dependency Upgrade]
        TestFix[Test Fixing]
        Impl[Implementation Agent]
        Review[Review Agent]
    end

    subgraph "Evaluation Layer"
        Eval[Evaluation Agent]
        Metrics[Quality Metrics]
        Feedback[Feedback Generation]
    end

    CLI --> Orch
    VSCode --> Orch
    Cursor --> Orch

    Orch --> SM
    Orch --> EB
    Orch --> Pipeline

    SM --> AppLoader
    AppLoader --> Env
    Env --> WfDiscovery
    WfDiscovery --> CompScanner
    CompScanner --> TestGen

    TestGen --> Exec
    Exec --> Perf
    Perf --> Analysis

    Analysis --> Visual
    Analysis --> DOM
    Analysis --> A11y

    Analysis --> Remed
    Remed --> DepUp
    DepUp --> TestFix
    TestFix --> Impl
    Impl --> Review

    Review --> Eval
    Eval --> Metrics
    Eval --> Feedback

    Feedback -.->|Continuous Improvement| TestGen

    style Orch fill:#f9f,stroke:#333,stroke-width:4px
    style WfDiscovery fill:#9f9,stroke:#333,stroke-width:2px
    style Eval fill:#99f,stroke:#333,stroke-width:2px
```

## Application-Aware Testing Pipeline

```mermaid
flowchart LR
    Start([User Starts Test]) --> Mode{Application<br/>Mode?}

    Mode -->|Framework Only| FrameworkPath
    Mode -->|Application| AppPath

    subgraph FrameworkPath[Framework-Only Pipeline]
        F1[Environment Setup]
        F2[Manual Component<br/>Specification]
        F3[Generic Test<br/>Generation]
        F4[Test Execution]

        F1 --> F2 --> F3 --> F4
    end

    subgraph AppPath[Application-Aware Pipeline]
        A1[Load Application]
        A2[Workflow Discovery]
        A3[Component Scanning]
        A4[Context-Aware Test<br/>Generation]
        A5[Test Execution]

        A1 --> A2
        A2 --> A3
        A3 --> A4
        A4 --> A5
    end

    FrameworkPath --> Analysis
    AppPath --> Analysis

    subgraph Analysis[Analysis & Remediation]
        An1[Multi-Dimensional<br/>Analysis]
        An2[AI-Powered<br/>Remediation]
        An3[Auto Dependency<br/>Upgrade]
        An4[Test Fixing]

        An1 --> An2 --> An3 --> An4
    end

    Analysis --> Results[Generate Reports]

    style AppPath fill:#e1f5e1
    style A2 fill:#9f9
    style A4 fill:#9f9
```

## Workflow Discovery Process

```mermaid
sequenceDiagram
    participant App as Running Application
    participant WD as Workflow Discovery Agent
    participant Browser as Playwright Browser
    participant TestGen as Test Generation Agent

    WD->>Browser: Launch browser
    Browser->>App: Navigate to root URL

    loop For Each Page (max depth/pages)
        Browser->>App: Load page
        App-->>Browser: Page rendered

        Browser->>WD: Extract page data
        WD->>WD: Discover components
        WD->>WD: Find interactive elements
        WD->>WD: Extract navigation links
        Browser->>WD: Take screenshot

        WD->>WD: Build workflow steps
    end

    WD->>WD: Generate workflow graph
    WD->>WD: Analyze component usage
    WD->>WD: Detect usage patterns

    WD->>TestGen: Provide workflow context
    TestGen->>TestGen: Generate context-aware tests

    Note over WD,TestGen: Tests include:<br/>- Pages where component is used<br/>- Workflow steps<br/>- Usage patterns
```

## Agent State Machine

```mermaid
stateDiagram-v2
    [*] --> IDLE
    IDLE --> INITIALIZING

    INITIALIZING --> APPLICATION_LOADING: Has Application Config
    INITIALIZING --> ENVIRONMENT_SETUP: Framework Only

    APPLICATION_LOADING --> WORKFLOW_DISCOVERY
    WORKFLOW_DISCOVERY --> TEST_GENERATION

    ENVIRONMENT_SETUP --> TEST_GENERATION

    TEST_GENERATION --> TEST_EXECUTION
    TEST_EXECUTION --> ANALYSIS

    ANALYSIS --> COMPLETE: No Breaking Changes
    ANALYSIS --> REMEDIATION_PROPOSAL: Breaking Changes Found

    REMEDIATION_PROPOSAL --> AWAITING_APPROVAL
    AWAITING_APPROVAL --> DEPENDENCY_UPGRADE: Approved
    AWAITING_APPROVAL --> COMPLETE: Rejected

    DEPENDENCY_UPGRADE --> TEST_FIXING
    TEST_FIXING --> IMPLEMENTING
    IMPLEMENTING --> REVIEWING

    REVIEWING --> EVALUATION
    EVALUATION --> COMPLETE

    COMPLETE --> [*]

    ANALYSIS --> ERROR: Critical Failure
    ERROR --> [*]

    note right of WORKFLOW_DISCOVERY
        Discovers:
        - Pages
        - Components
        - Workflows
        - Usage Patterns
    end note

    note right of TEST_GENERATION
        Uses workflow context
        to generate application-aware
        tests
    end note
```

## Component Discovery Flow

```mermaid
flowchart TD
    Start([Test Generation Starts]) --> CheckWorkflow{Workflow Data<br/>Available?}

    CheckWorkflow -->|Yes| UseWorkflow[Priority 1:<br/>Use Workflow Discovery]
    CheckWorkflow -->|No| CheckApp{Application<br/>Path Exists?}

    UseWorkflow --> Components[Component List]

    CheckApp -->|Yes| ScanSource[Priority 2:<br/>Scan Source Files]
    CheckApp -->|No| CheckManual{Manual Include<br/>Specified?}

    ScanSource --> DetectImports[Detect Imports]
    DetectImports --> DetectUsage[Detect JSX/HTML Usage]
    DetectUsage --> MergeManual{Manual Components?}

    MergeManual -->|Yes| Merge[Merge with Manual]
    MergeManual -->|No| Components

    Merge --> Components

    CheckManual -->|Yes| UseManual[Priority 3:<br/>Use Manual List]
    CheckManual -->|No| UseDefaults[Priority 4:<br/>Use Defaults]

    UseManual --> Components
    UseDefaults --> Components

    Components --> ApplyExclusions[Apply Exclusions]
    ApplyExclusions --> FinalList[Final Component List]

    FinalList --> GenerateTests[Generate Tests]

    style UseWorkflow fill:#9f9
    style ScanSource fill:#9f9
    style FinalList fill:#f99
```

## Data Flow Architecture

```mermaid
flowchart LR
    subgraph Input
        Config[Configuration File]
        App[Application Code]
    end

    subgraph Discovery
        WF[Workflow Discovery]
        CS[Component Scanner]
    end

    subgraph Context[Test Context]
        Pages[Pages Data]
        Workflows[Workflows Data]
        Components[Component List]
        Usage[Usage Patterns]
    end

    subgraph Generation
        Prompt[AI Prompt Builder]
        AI[Claude API]
        Tests[Generated Tests]
    end

    subgraph Execution
        Containers[Docker/Podman<br/>Containers]
        Playwright[Playwright<br/>Test Runner]
        Results[Test Results]
    end

    subgraph Storage
        DB[(SQLite Database)]
        FS[File System<br/>(Screenshots, Reports)]
    end

    Config --> WF
    App --> WF
    App --> CS

    WF --> Pages
    WF --> Workflows
    WF --> Components
    WF --> Usage

    CS --> Components

    Pages --> Prompt
    Workflows --> Prompt
    Components --> Prompt
    Usage --> Prompt

    Prompt --> AI
    AI --> Tests

    Tests --> Playwright
    Containers --> Playwright
    Playwright --> Results

    Results --> DB
    Results --> FS
    Pages --> DB
    Workflows --> DB

    style WF fill:#9f9
    style CS fill:#9f9
    style Prompt fill:#99f
    style DB fill:#f99
```

## Event-Driven Architecture

```mermaid
sequenceDiagram
    participant Orch as Orchestrator
    participant EB as Event Bus
    participant Agent as Agent (Any)
    participant Eval as Evaluation Agent
    participant Monitor as Monitoring

    Orch->>Agent: Execute task
    activate Agent

    Agent->>EB: Emit: STAGE_STARTED
    EB->>Monitor: Forward event
    Monitor->>Monitor: Update dashboard

    Agent->>Agent: Perform work

    Agent->>EB: Emit: Progress events
    EB->>Monitor: Forward events
    EB->>Eval: Forward to evaluation

    Eval->>Eval: Analyze quality in real-time

    Agent->>EB: Emit: STAGE_COMPLETED
    deactivate Agent

    EB->>Monitor: Forward completion
    EB->>Eval: Trigger evaluation

    Eval->>EB: Emit: Quality alerts
    EB->>Monitor: Show alerts

    Note over Orch,Monitor: Continuous feedback loop<br/>enables real-time quality monitoring
```

## 13 Agents Collaboration

```mermaid
graph TD
    Orch[Orchestrator] --> AppLoader[Application Loader<br/>Loads app code]
    Orch --> Env[Environment<br/>Container management]

    AppLoader --> WfDisc[Workflow Discovery<br/>Crawls app structure]
    Env --> WfDisc

    WfDisc --> TestGen[Test Generation<br/>AI-powered test creation]

    TestGen --> Exec[Execution<br/>Parallel test running]

    Exec --> Analysis[Analysis<br/>Multi-dimensional comparison]

    Analysis --> Remed[Remediation<br/>AI fix proposals]
    Analysis --> Eval[Evaluation<br/>Quality monitoring]

    Remed --> DepUp[Dependency Upgrade<br/>package.json updates]
    DepUp --> TestFix[Test Fixing<br/>Auto-fix broken tests]
    TestFix --> Impl[Implementation<br/>Apply code changes]
    Impl --> Review[Review<br/>Verify fixes]

    Review --> Eval

    Eval -.->|Feedback| TestGen
    Eval -.->|Recommendations| Orch

    style Orch fill:#f9f
    style WfDisc fill:#9f9
    style TestGen fill:#99f
    style Eval fill:#ff9
```

## Technology Stack

```mermaid
graph LR
    subgraph Frontend
        CLI[CLI - Commander.js]
        VSC[VS Code Extension<br/>Coming Soon]
    end

    subgraph "Core System"
        TS[TypeScript]
        Agents[13 AI Agents]
        SM[State Machine]
        Events[Event Bus]
    end

    subgraph "AI Layer"
        Anthropic[Anthropic Claude API]
        Structured[Structured Outputs]
    end

    subgraph "Testing Layer"
        PW[Playwright]
        Browsers[Chromium/Firefox/WebKit]
    end

    subgraph "Infrastructure"
        Docker[Docker]
        Podman[Podman<br/>Rootless Support]
        Git[Git Integration]
    end

    subgraph "Storage"
        SQLite[(SQLite<br/>Test Data)]
        FS[File System<br/>Screenshots/Reports]
    end

    CLI --> Agents
    VSC --> Agents

    Agents --> Anthropic
    Agents --> PW
    Agents --> Docker
    Agents --> Podman
    Agents --> SQLite
    Agents --> FS

    PW --> Browsers
    Agents --> Git

    style Agents fill:#f9f
    style Anthropic fill:#99f
```

---

## How to Use These Diagrams

### In GitHub/GitLab
These Mermaid diagrams will render automatically in Markdown files.

### In Documentation Tools
Most modern documentation tools support Mermaid:
- Docusaurus
- VuePress
- GitBook
- Notion
- Confluence (with plugins)

### Export as Images
Use tools like:
- [Mermaid Live Editor](https://mermaid.live/)
- `mmdc` CLI tool
- VS Code Mermaid extensions

### Example Export Command
```bash
npm install -g @mermaid-js/mermaid-cli
mmdc -i ARCHITECTURE_DIAGRAM.md -o architecture.png
```

---

## Diagram Legend

| Color | Meaning |
|-------|---------|
| 🟣 Purple | Orchestration/Control |
| 🟢 Green | Discovery/Intelligence |
| 🔵 Blue | AI/Generation |
| 🟡 Yellow | Evaluation/Feedback |
| 🔴 Red | Critical/Storage |
