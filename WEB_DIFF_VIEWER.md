# Web Diff Viewer: Interactive Visual Comparison

## Overview

The Web Diff Viewer is a browser-based interface for inspecting and comparing visual snapshots, DOM changes, and CSS differences between UI component versions. It provides an intuitive way to review test results without parsing raw JSON or terminal output.

## Key Features

### 1. **Interactive Browser UI**
- Clean, GitHub-inspired dark theme
- Responsive design (works on mobile and desktop)
- No build step required - pure vanilla JavaScript
- Real-time comparison browsing

### 2. **Side-by-Side Comparison**
- Visual screenshot comparison
- Base version vs Target version layout
- High-resolution image viewing
- Automatic fallback for missing screenshots

### 3. **Similarity Scoring**
- Color-coded similarity badges
  - 🟢 Green: ≥90% similar (high confidence)
  - 🟡 Yellow: 70-89% similar (moderate differences)
  - 🔴 Red: <70% similar (significant changes)

### 4. **DOM Diff Visualization**
- Added elements highlighted in green
- Removed elements highlighted in red
- Modified elements highlighted in yellow
- Element paths for precise location tracking

### 5. **CSS Property Tracking**
- Style changes across selectors
- Old value → New value transitions
- Property-level granularity

### 6. **Session Management**
- View all sessions
- Filter by component
- Browse snapshots by version
- Quick access to comparison details

## Usage

### Basic Usage

After running a test session, launch the diff viewer:

```bash
pixeldust show-diff <session-id>
```

This will:
1. Start a local web server on port 3000
2. Automatically open your default browser
3. Load the comparison viewer for the session

### Command Options

```bash
# Use custom port
pixeldust show-diff <session-id> --port 3001

# Don't open browser automatically
pixeldust show-diff <session-id> --no-open

# Both options together
pixeldust show-diff <session-id> --port 8080 --no-open
```

### Stopping the Server

Press `Ctrl+C` in the terminal to gracefully shut down the server.

## User Interface

### Main View

```
┌─────────────────────────────────────────────────────────┐
│  🔍 PixelDust Diff Viewer                               │
│  Session: abc123-def456 | State: COMPLETE               │
├─────────────────────────────────────────────────────────┤
│  [Comparisons] [Snapshots]                              │
├─────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────┐  │
│  │ ui5-button                          95.2% Similar │  │
│  │ Differences: 2 | Verdict: PASS                    │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │ ui5-input                           88.7% Similar │  │
│  │ Differences: 5 | Verdict: REVIEW                  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Comparison Detail View

```
┌─────────────────────────────────────────────────────────┐
│  [← Back to List]  [Side by Side]  [Overlay]            │
├─────────────────────────────────────────────────────────┤
│  ui5-button Comparison                                  │
│                                                          │
│  Similarity: 95.2% | Differences: 2 | Verdict: PASS    │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌─────────────────────┐     │
│  │ Base Version (1.0)  │  │ Target Version (2.0)│     │
│  │ [Screenshot Image]  │  │ [Screenshot Image]  │     │
│  └─────────────────────┘  └─────────────────────┘     │
├─────────────────────────────────────────────────────────┤
│  DOM Changes                                            │
│  + Added: .ui5-button__icon                            │
│  - Removed: .deprecated-class                          │
│  ~ Modified: .ui5-button: data-state                   │
├─────────────────────────────────────────────────────────┤
│  Style Changes                                          │
│  .ui5-button                                           │
│    color: #000 → #333                                  │
│    padding: 8px → 12px                                 │
└─────────────────────────────────────────────────────────┘
```

## Architecture

### Backend (Express Server)

**File**: `src/web/server.ts`

#### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sessions` | GET | List all test sessions |
| `/api/sessions/:sessionId` | GET | Get session details |
| `/api/sessions/:sessionId/snapshots` | GET | Get snapshots for session |
| `/api/sessions/:sessionId/comparisons` | GET | Get comparisons for session |
| `/api/snapshots/:snapshotId` | GET | Get snapshot metadata |
| `/api/snapshots/:snapshotId/screenshot` | GET | Serve screenshot image |
| `/api/comparisons/:comparisonId` | GET | Get comparison details |
| `/health` | GET | Health check endpoint |

#### Query Parameters

- `version`: Filter snapshots by version
- `component`: Filter by component name

**Example**:
```bash
curl http://localhost:3000/api/sessions/abc123/snapshots?version=1.0.0&component=ui5-button
```

### Frontend (Vanilla JavaScript)

**Embedded in**: `src/web/server.ts` (generateFrontendHTML method)

#### Key Components

1. **Session Loader**: Fetches and displays session info
2. **Tab System**: Switches between Comparisons and Snapshots views
3. **Comparison List**: Displays all comparisons with scores
4. **Comparison Viewer**: Shows detailed side-by-side comparison
5. **Snapshot List**: Shows all captured snapshots

#### JavaScript Functions

- `loadSession()`: Loads session metadata
- `loadComparisons()`: Fetches comparison list
- `loadSnapshots()`: Fetches snapshot list
- `createComparisonCard()`: Renders comparison card
- `showComparisonDetails()`: Shows detailed comparison view
- `renderDomDiff()`: Renders DOM changes
- `renderStyleDiff()`: Renders CSS changes
- `backToList()`: Returns to comparison list

### Database Integration

The web server directly queries the database using `DatabaseManager`:

```typescript
const db = new DatabaseManager();
const session = db.getSession(sessionId);
const comparisons = db.getSnapshotComparisons(sessionId);
const snapshots = db.getSnapshots(sessionId, version, component);
```

## Styling

### Color Palette

- **Background**: `#0d1117` (Dark gray)
- **Surface**: `#161b22` (Lighter gray)
- **Border**: `#30363d` (Gray border)
- **Text**: `#c9d1d9` (Light gray text)
- **Accent**: `#58a6ff` (Blue)
- **Success**: `#238636` (Green)
- **Warning**: `#d29922` (Yellow)
- **Error**: `#da3633` (Red)

### Responsive Design

```css
@media (max-width: 768px) {
  .image-comparison {
    grid-template-columns: 1fr;  /* Stack images vertically */
  }

  .comparison-details {
    grid-template-columns: 1fr;  /* Single column layout */
  }
}
```

## Common Use Cases

### Use Case 1: Reviewing After Test Run

```bash
# Run tests
pixeldust test

# Get session ID from output
# Session: abc123-def456-ghi789

# Open diff viewer
pixeldust show-diff abc123-def456-ghi789
```

**Workflow**:
1. Browser opens automatically
2. Review comparison list
3. Click on components with differences
4. Inspect visual changes, DOM diffs, and style changes
5. Make decisions on whether changes are acceptable

### Use Case 2: CI/CD Integration

```bash
# Run tests in CI
pixeldust test --headless

# Generate report for review
pixeldust show-diff $SESSION_ID --no-open --port 8080 &

# Keep server running for team review
# Team accesses: http://ci-server:8080/?session=$SESSION_ID
```

### Use Case 3: Debugging Failing Tests

```bash
# Test failed
pixeldust show-diff failed-session-id

# Look for:
# 1. Visual differences in screenshots
# 2. Unexpected DOM changes
# 3. CSS property modifications
# 4. Similarity scores below threshold
```

### Use Case 4: Multiple Sessions

```bash
# Open one session
pixeldust show-diff session-1 --port 3000 &

# Open another session on different port
pixeldust show-diff session-2 --port 3001 &

# Compare results side by side in separate browser tabs
```

## Error Handling

### Port Already in Use

**Error**:
```
❌ Port 3000 is already in use.
   Try using a different port: pixeldust show-diff <session-id> --port 3001
```

**Solution**:
```bash
# Use different port
pixeldust show-diff <session-id> --port 3001

# Or kill existing process
lsof -ti:3000 | xargs kill -9
```

### Session Not Found

**Error**:
```
Session abc123 not found
```

**Solution**:
```bash
# List available sessions
pixeldust list

# Use correct session ID
pixeldust show-diff correct-session-id
```

### Screenshot Not Found

The UI displays a placeholder SVG if screenshot is missing:
- Gray box with "No Screenshot" text
- Happens when test didn't capture screenshot
- Metadata still available for review

### Network Issues

**Browser doesn't open**:
```
⚠ Could not open browser automatically. Please open the URL manually.

URL: http://localhost:3000/?session=abc123
```

**Solution**: Manually open the URL in your browser.

## Performance Considerations

### Screenshot Loading

- Screenshots are served on-demand
- Large screenshots may take time to load
- Progressive loading with placeholders

### Database Queries

- Indexed queries for fast retrieval
- Session queries: O(1) with session ID
- Comparison queries: O(n) with component filter
- Snapshot queries: O(n) with version/component filter

### Memory Usage

- Server keeps database connection open
- Images served from disk (not cached in memory)
- Minimal memory footprint (~50MB)

## Security Considerations

### Local Development Only

⚠️ **Warning**: The web server is designed for local development only.

**Not recommended for production**:
- No authentication
- No rate limiting
- No HTTPS
- No input sanitization
- Direct database access

### Safe Usage

✅ **Recommended**:
- Run on localhost only
- Use for local testing and review
- Close server when done
- Don't expose port to network

❌ **Not recommended**:
- Exposing to public internet
- Running in production environments
- Storing sensitive data in screenshots

## Extending the Viewer

### Adding Custom View Modes

The frontend supports custom view modes (currently Side-by-Side and Overlay):

```javascript
// Add new button
<button class="btn" data-view="custom">Custom View</button>

// Add event listener
document.querySelectorAll('.btn[data-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    switchView(view);
  });
});

function switchView(view) {
  if (view === 'custom') {
    // Your custom view logic
  }
}
```

### Adding Overlay Mode

Future enhancement: Implement slider-based overlay comparison:

```javascript
function renderOverlay(baseImg, targetImg) {
  return `
    <div class="overlay-container">
      <img src="${targetImg}" class="base-image" />
      <div class="slider-container" style="clip-path: inset(0 50% 0 0)">
        <img src="${baseImg}" class="overlay-image" />
      </div>
      <input type="range" class="overlay-slider" min="0" max="100" value="50" />
    </div>
  `;
}
```

### Adding Export Functionality

Add export button to save comparison data:

```javascript
function exportComparison(comparison) {
  const data = JSON.stringify(comparison, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `comparison-${comparison.component}.json`;
  a.click();
}
```

## Troubleshooting

### Problem: Browser opens but shows blank page

**Cause**: JavaScript error or incorrect session ID

**Solution**:
1. Open browser console (F12)
2. Check for errors
3. Verify session ID in URL matches database

### Problem: Screenshots don't load

**Cause**: Screenshot files not found on disk

**Solution**:
1. Check storage path in config
2. Verify files exist: `ls ~/.pixeldust/sessions/<session-id>/screenshots/`
3. Check file permissions

### Problem: Server won't stop

**Cause**: Process not responding to Ctrl+C

**Solution**:
```bash
# Find process
lsof -ti:3000

# Kill process
kill -9 <pid>
```

### Problem: Slow performance

**Cause**: Large screenshots or many comparisons

**Solution**:
1. Reduce viewport size in config
2. Compress screenshots
3. Limit number of components tested
4. Use `--headless` mode for faster tests

## Future Enhancements

### Phase 1 (Planned)
- [ ] Overlay comparison mode with slider
- [ ] Zoom and pan for large screenshots
- [ ] Keyboard shortcuts (←/→ for navigation)
- [ ] Fullscreen image view
- [ ] Export comparison as PDF

### Phase 2 (Planned)
- [ ] Annotation tools (markup screenshots)
- [ ] Share comparisons via URL
- [ ] Comparison history timeline
- [ ] Approve/reject workflow
- [ ] Team collaboration features

### Phase 3 (Planned)
- [ ] Video recording playback
- [ ] Performance flame graphs
- [ ] Network request inspection
- [ ] Console log viewing
- [ ] Source map integration

## Conclusion

The Web Diff Viewer transforms raw test data into an intuitive visual interface, making it easy to:
- Review visual changes at a glance
- Identify breaking changes quickly
- Understand DOM and CSS modifications
- Make informed decisions about upgrades
- Share results with team members

It complements the CLI tools and provides a more user-friendly way to interact with test results, especially for visual regression testing and UI component version comparisons.
