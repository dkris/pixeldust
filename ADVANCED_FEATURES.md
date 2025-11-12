# PixelDust Enhancement Plan: Advanced Features

## Overview
This document outlines the implementation plan for 6 major enhancements to PixelDust's agentic testing system.

---

## 1. Evaluation & Continuous Improvement ✅ IMPLEMENTED

### Goal
Add a feedback loop to continuously improve the agentic workflow based on test results.

### Implementation Status: **COMPLETE**

**EvaluationAgent** (Implemented)
- ✅ Analyzes test results, comparison quality, and remediation effectiveness
- ✅ Learns from successful vs failed test runs
- ✅ Provides AI-powered feedback to improve future test generation
- ✅ Stores evaluation metrics in database
- ✅ Integrated into orchestrator state machine
- ✅ CLI command `pixeldust show-evaluation` for viewing feedback

**Features:**
- Success rate tracking per component
- Test quality scoring
- Remediation effectiveness measurement
- Automatic prompt tuning based on results

**Database Schema:**
```sql
CREATE TABLE evaluations (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  agent_type TEXT,
  metrics JSON,
  feedback JSON,
  timestamp INTEGER
);
```

---

## 2. Application Workflow-Based Test Generation

### Goal
Generate tests based on actual user workflows in the application, not arbitrary test cases.

### Implementation

**Workflow Discovery:**
- Analyze application code for user flows (routes, event handlers, state transitions)
- Detect common patterns: form submissions, navigation, data loading
- Map component interactions and dependencies

**Enhanced Test Generation:**
- Generate tests that follow real user journeys
- Test component interactions, not just isolated components
- Include realistic data flows and state changes

**Example Workflow Detection:**
```javascript
// Detect: Login → Dashboard → Product List → Product Detail
// Generate tests that follow this flow
```

---

## 3. Application Snapshot Database

### Goal
Store visual and DOM snapshots in a queryable local database for comparison.

### Database Schema

```sql
CREATE TABLE snapshots (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  version TEXT,
  component TEXT,
  url TEXT,
  viewport JSON,
  screenshot_path TEXT,
  dom_snapshot TEXT,
  computed_styles JSON,
  metrics JSON,
  timestamp INTEGER
);

CREATE TABLE snapshot_comparisons (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  base_snapshot_id TEXT,
  target_snapshot_id TEXT,
  visual_diff JSON,
  dom_diff JSON,
  style_diff JSON,
  similarity_score REAL,
  differences_found INTEGER,
  timestamp INTEGER
);
```

**Storage Structure:**
```
./pixeldust-data/
├── screenshots/
│   ├── session-abc/
│   │   ├── v1.24.0/
│   │   │   ├── ui5-button-default.png
│   │   │   └── ui5-button-hover.png
│   │   └── v2.0.0/
│   │       ├── ui5-button-default.png
│   │       └── ui5-button-hover.png
│   └── diffs/
│       └── session-abc/
│           └── ui5-button-default-diff.png
└── dom-snapshots/
    └── session-abc/
        ├── v1.24.0/
        └── v2.0.0/
```

---

## 4. Structured JSON Comparison API

### Goal
Expose snapshots as structured JSON with side-by-side comparisons highlighting differences.

### API Structure

```typescript
interface SnapshotComparison {
  sessionId: string;
  component: string;
  baseVersion: string;
  targetVersion: string;
  comparison: {
    visual: {
      diffPercentage: number;
      diffPixels: number;
      diffImage: string; // path to diff image
      baseImage: string;
      targetImage: string;
      regions: DiffRegion[];
    };
    dom: {
      added: DOMNode[];
      removed: DOMNode[];
      modified: DOMNode[];
      unchanged: DOMNode[];
    };
    styles: {
      changed: StyleDiff[];
      added: StyleDiff[];
      removed: StyleDiff[];
    };
    performance: {
      baseMetrics: Metrics;
      targetMetrics: Metrics;
      improvements: string[];
      regressions: string[];
    };
  };
  score: number; // 0-100 similarity score
  verdict: 'identical' | 'minor-changes' | 'significant-changes' | 'breaking-changes';
}
```

**CLI Command:**
```bash
pixeldust export-comparison <session-id> --output comparison.json
```

---

## 5. Similarity Scoring System

### Goal
Score comparisons with no/minimal differences to highlight probability of correctness.

### Scoring Algorithm

```typescript
function calculateSimilarityScore(comparison: ComparisonData): number {
  const weights = {
    visual: 0.40,     // 40% weight on visual similarity
    dom: 0.30,        // 30% weight on DOM structure
    styles: 0.20,     // 20% weight on computed styles
    performance: 0.10 // 10% weight on performance
  };

  const visualScore = 100 - (comparison.visual.diffPercentage * 100);
  const domScore = calculateDOMSimilarity(comparison.dom);
  const styleScore = calculateStyleSimilarity(comparison.styles);
  const perfScore = calculatePerformanceSimilarity(comparison.performance);

  return (
    visualScore * weights.visual +
    domScore * weights.dom +
    styleScore * weights.styles +
    perfScore * weights.performance
  );
}
```

**Score Interpretation:**
- **95-100**: Identical (high confidence)
- **85-94**: Minor differences (likely safe)
- **70-84**: Moderate differences (review recommended)
- **50-69**: Significant differences (caution)
- **0-49**: Major differences (breaking changes likely)

**Confidence Factors:**
- Number of test scenarios run
- Visual pixel match percentage
- DOM structure preservation
- Style consistency
- Performance stability

---

## 6. Web-Based Diff Viewer ✅ IMPLEMENTED

### Goal
Create `pixeldust show-diff` command that launches a web UI for visual comparison.

### Implementation Status: **COMPLETE**

**WebServer** (Implemented)
- ✅ Express.js server with RESTful API endpoints
- ✅ Single-page application with vanilla JavaScript
- ✅ Side-by-side image comparison
- ✅ DOM tree diff visualization
- ✅ CSS property comparison
- ✅ Similarity scoring with color-coded badges
- ✅ Tab-based navigation (Comparisons/Snapshots)
- ✅ Automatic browser opening
- ✅ CLI command `pixeldust show-diff` with port configuration

### Architecture

```
┌─────────────────────────────────────────────┐
│        pixeldust show-diff <session>        │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│         Express.js Web Server               │
│         Port: 3500 (configurable)           │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│           React UI (served)                 │
│  - Side-by-side snapshot comparison         │
│  - Interactive diff highlighting            │
│  - Zoom, pan, overlay controls              │
│  - DOM tree comparison                      │
│  - Style diff viewer                        │
│  - Performance charts                       │
└─────────────────────────────────────────────┘
```

### UI Features

**1. Image Comparison View**
- Side-by-side layout (base vs target)
- Overlay mode with opacity slider
- Difference highlighting (red overlay)
- Zoom and pan controls
- Fullscreen mode

**2. DOM Comparison View**
- Tree view of DOM structure
- Added nodes (green)
- Removed nodes (red)
- Modified nodes (yellow)
- Expandable/collapsible tree

**3. Style Comparison View**
- CSS property comparison table
- Changed properties highlighted
- Before/after values
- Computed styles diff

**4. Performance View**
- Bar charts for metrics
- Timeline comparison
- Improvements/regressions highlighted

**5. Navigation**
- Component selector
- Version selector
- Filter by change type
- Search functionality

### Technology Stack

**Backend:**
- Express.js for web server
- SQLite queries for data
- Image serving with caching
- JSON API endpoints

**Frontend:**
- React for UI components
- Pixelmatch for visual diffs
- D3.js for charts
- React-Split for resizable panes

### CLI Integration

```bash
# Launch diff viewer for session
pixeldust show-diff <session-id>

# Launch on custom port
pixeldust show-diff <session-id> --port 8080

# Filter by component
pixeldust show-diff <session-id> --component ui5-button

# Export static HTML report
pixeldust show-diff <session-id> --export ./report.html
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Add snapshots to database schema
- [ ] Implement snapshot storage in ExecutionAgent
- [ ] Create SnapshotComparison data structure
- [ ] Add basic scoring algorithm

### Phase 2: Enhanced Test Generation (Week 2)
- [ ] Implement workflow discovery
- [ ] Enhance TestGenerationAgent with context
- [ ] Add application flow analysis
- [ ] Generate workflow-based tests

### Phase 3: Evaluation System ✅ COMPLETE
- [x] Create EvaluationAgent
- [x] Implement metrics collection
- [x] Add feedback loop to orchestrator
- [x] Store evaluation data
- [x] Add CLI command to view evaluations
- [x] Generate AI-powered recommendations

### Phase 4: Comparison API (Week 3)
- [ ] Build structured JSON export
- [ ] Create comparison CLI command
- [ ] Add diff image generation
- [ ] Implement similarity scoring

### Phase 5: Web UI ✅ COMPLETE
- [x] Set up Express server
- [x] Build vanilla JavaScript frontend (no build required)
- [x] Implement side-by-side image comparison view
- [x] Add DOM diff visualization
- [x] Create style comparison
- [x] Integrate with database via API endpoints
- [x] Add CLI command with automatic browser opening
- [x] Implement tab navigation and filtering

### Phase 6: Polish & Documentation (Week 6)
- [ ] Performance optimization
- [ ] Error handling
- [ ] User documentation
- [ ] Example workflows
- [ ] Video tutorials

---

## Expected Outcomes

### 1. Better Test Quality
- Tests based on real user workflows
- Higher detection of actual breaking changes
- Fewer false positives

### 2. Faster Reviews
- Visual diff viewer saves manual comparison time
- Clear scoring helps prioritize issues
- Side-by-side comparison accelerates decisions

### 3. Continuous Improvement
- Evaluation agent learns from results
- Test generation improves over time
- Higher accuracy with each run

### 4. Better Insights
- Structured data enables analytics
- Historical comparison trends
- Pattern recognition in changes

### 5. Enhanced UX
- Web UI is more intuitive than CLI logs
- Interactive exploration of differences
- Shareable reports for teams

---

## Success Metrics

- **Test Quality**: 80%+ of tests follow real user workflows
- **Accuracy**: 90%+ similarity score accuracy
- **Performance**: Diff viewer loads in < 2 seconds
- **Usability**: Complete comparison review in < 5 minutes
- **Improvement**: 10%+ better test generation each iteration

---

## Next Steps

1. Review and approve this plan
2. Begin Phase 1 implementation
3. Iterate based on feedback
4. Deploy features incrementally
5. Gather user feedback
