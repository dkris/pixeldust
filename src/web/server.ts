import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { DatabaseManager } from '../storage/database';
import Logger from '../utils/logger';
import { readFileSync, existsSync } from 'fs';

/**
 * Web Server for Diff Viewer
 *
 * Provides a browser-based interface for viewing:
 * - Snapshot comparisons
 * - Visual diffs
 * - DOM tree differences
 * - CSS property changes
 * - Performance metrics
 */
export class WebServer {
  private app: Express;
  private db: DatabaseManager;
  private logger: Logger;
  private port: number;
  private server: any;

  constructor(db: DatabaseManager, port: number = 3000) {
    this.app = express();
    this.db = db;
    this.logger = new Logger('WEB_SERVER');
    this.port = port;
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  private setupRoutes(): void {
    // API Routes
    this.app.get('/api/sessions', this.getSessions.bind(this));
    this.app.get('/api/sessions/:sessionId', this.getSession.bind(this));
    this.app.get('/api/sessions/:sessionId/snapshots', this.getSnapshots.bind(this));
    this.app.get('/api/sessions/:sessionId/comparisons', this.getComparisons.bind(this));
    this.app.get('/api/snapshots/:snapshotId', this.getSnapshot.bind(this));
    this.app.get('/api/comparisons/:comparisonId', this.getComparison.bind(this));
    this.app.get('/api/snapshots/:snapshotId/screenshot', this.getScreenshot.bind(this));

    // Serve static frontend
    this.app.get('/', this.serveFrontend.bind(this));
    this.app.get('/diff/:sessionId', this.serveFrontend.bind(this));

    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok' });
    });
  }

  // ============================================================================
  // API Handlers
  // ============================================================================

  private getSessions(req: Request, res: Response): void {
    try {
      const sessions = this.db.getSessions();
      res.json(sessions);
    } catch (error) {
      this.logger.error('Failed to get sessions', error as Error);
      res.status(500).json({ error: 'Failed to retrieve sessions' });
    }
  }

  private getSession(req: Request, res: Response): void {
    try {
      const { sessionId } = req.params;
      const session = this.db.getSession(sessionId);

      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      res.json(session);
    } catch (error) {
      this.logger.error('Failed to get session', error as Error);
      res.status(500).json({ error: 'Failed to retrieve session' });
    }
  }

  private getSnapshots(req: Request, res: Response): void {
    try {
      const { sessionId } = req.params;
      const { version, component } = req.query;

      const snapshots = this.db.getSnapshots(
        sessionId,
        version as string | undefined,
        component as string | undefined
      );

      res.json(snapshots);
    } catch (error) {
      this.logger.error('Failed to get snapshots', error as Error);
      res.status(500).json({ error: 'Failed to retrieve snapshots' });
    }
  }

  private getComparisons(req: Request, res: Response): void {
    try {
      const { sessionId } = req.params;
      const { component } = req.query;

      const comparisons = this.db.getSnapshotComparisons(
        sessionId,
        component as string | undefined
      );

      res.json(comparisons);
    } catch (error) {
      this.logger.error('Failed to get comparisons', error as Error);
      res.status(500).json({ error: 'Failed to retrieve comparisons' });
    }
  }

  private getSnapshot(req: Request, res: Response): void {
    try {
      const { snapshotId } = req.params;
      const snapshot = this.db.getSnapshot(snapshotId);

      if (!snapshot) {
        res.status(404).json({ error: 'Snapshot not found' });
        return;
      }

      res.json(snapshot);
    } catch (error) {
      this.logger.error('Failed to get snapshot', error as Error);
      res.status(500).json({ error: 'Failed to retrieve snapshot' });
    }
  }

  private getComparison(req: Request, res: Response): void {
    try {
      const { comparisonId } = req.params;
      const comparison = this.db.getSnapshotComparison(comparisonId);

      if (!comparison) {
        res.status(404).json({ error: 'Comparison not found' });
        return;
      }

      res.json(comparison);
    } catch (error) {
      this.logger.error('Failed to get comparison', error as Error);
      res.status(500).json({ error: 'Failed to retrieve comparison' });
    }
  }

  private getScreenshot(req: Request, res: Response): void {
    try {
      const { snapshotId } = req.params;
      const snapshot = this.db.getSnapshot(snapshotId);

      if (!snapshot || !snapshot.screenshotPath) {
        res.status(404).json({ error: 'Screenshot not found' });
        return;
      }

      // Check if file exists
      if (!existsSync(snapshot.screenshotPath)) {
        res.status(404).json({ error: 'Screenshot file not found' });
        return;
      }

      // Serve the image file
      res.sendFile(path.resolve(snapshot.screenshotPath));
    } catch (error) {
      this.logger.error('Failed to get screenshot', error as Error);
      res.status(500).json({ error: 'Failed to retrieve screenshot' });
    }
  }

  private serveFrontend(req: Request, res: Response): void {
    try {
      const html = this.generateFrontendHTML();
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      this.logger.error('Failed to serve frontend', error as Error);
      res.status(500).send('Failed to load diff viewer');
    }
  }

  // ============================================================================
  // Server Lifecycle
  // ============================================================================

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, () => {
          this.logger.info(`Web server started on http://localhost:${this.port}`);
          resolve();
        });

        this.server.on('error', (error: any) => {
          if (error.code === 'EADDRINUSE') {
            this.logger.error(`Port ${this.port} is already in use`);
            reject(new Error(`Port ${this.port} is already in use`));
          } else {
            reject(error);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.logger.info('Web server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getPort(): number {
    return this.port;
  }

  // ============================================================================
  // Frontend HTML Generation
  // ============================================================================

  private generateFrontendHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PixelDust Diff Viewer</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      line-height: 1.6;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
    }

    header {
      background: #161b22;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      border: 1px solid #30363d;
    }

    h1 {
      font-size: 28px;
      margin-bottom: 10px;
      color: #58a6ff;
    }

    .session-info {
      display: flex;
      gap: 20px;
      font-size: 14px;
      color: #8b949e;
    }

    .tabs {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
      border-bottom: 1px solid #30363d;
    }

    .tab {
      padding: 10px 20px;
      cursor: pointer;
      border: none;
      background: transparent;
      color: #8b949e;
      font-size: 14px;
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
    }

    .tab:hover {
      color: #c9d1d9;
    }

    .tab.active {
      color: #58a6ff;
      border-bottom-color: #58a6ff;
    }

    .tab-content {
      display: none;
    }

    .tab-content.active {
      display: block;
    }

    .comparison-list {
      display: grid;
      gap: 15px;
    }

    .comparison-card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 20px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .comparison-card:hover {
      border-color: #58a6ff;
      transform: translateY(-2px);
    }

    .comparison-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }

    .component-name {
      font-size: 18px;
      font-weight: 600;
      color: #c9d1d9;
    }

    .similarity-badge {
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
    }

    .similarity-high {
      background: #238636;
      color: #fff;
    }

    .similarity-medium {
      background: #d29922;
      color: #fff;
    }

    .similarity-low {
      background: #da3633;
      color: #fff;
    }

    .comparison-details {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin-top: 15px;
    }

    .detail-box {
      background: #0d1117;
      padding: 10px;
      border-radius: 6px;
    }

    .detail-label {
      font-size: 12px;
      color: #8b949e;
      margin-bottom: 5px;
    }

    .detail-value {
      font-size: 14px;
      color: #c9d1d9;
    }

    .comparison-viewer {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 20px;
    }

    .viewer-controls {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }

    .btn {
      padding: 8px 16px;
      border: 1px solid #30363d;
      background: #21262d;
      color: #c9d1d9;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
    }

    .btn:hover {
      background: #30363d;
      border-color: #58a6ff;
    }

    .btn.active {
      background: #58a6ff;
      border-color: #58a6ff;
      color: #fff;
    }

    .image-comparison {
      position: relative;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 30px;
    }

    .image-container {
      position: relative;
      background: #0d1117;
      border-radius: 6px;
      overflow: hidden;
    }

    .image-label {
      position: absolute;
      top: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.8);
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      z-index: 10;
    }

    .image-container img {
      width: 100%;
      height: auto;
      display: block;
    }

    .diff-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
    }

    .stat-card {
      background: #0d1117;
      padding: 15px;
      border-radius: 6px;
      border: 1px solid #30363d;
    }

    .stat-label {
      font-size: 12px;
      color: #8b949e;
      margin-bottom: 5px;
    }

    .stat-value {
      font-size: 24px;
      font-weight: 600;
      color: #58a6ff;
    }

    .dom-diff {
      margin-bottom: 30px;
    }

    .section-title {
      font-size: 18px;
      margin-bottom: 15px;
      color: #c9d1d9;
    }

    .diff-tree {
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 15px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 13px;
      overflow-x: auto;
    }

    .diff-added {
      color: #3fb950;
      background: rgba(63, 185, 80, 0.1);
      padding: 2px 4px;
      border-radius: 3px;
    }

    .diff-removed {
      color: #f85149;
      background: rgba(248, 81, 73, 0.1);
      padding: 2px 4px;
      border-radius: 3px;
    }

    .diff-modified {
      color: #d29922;
      background: rgba(210, 153, 34, 0.1);
      padding: 2px 4px;
      border-radius: 3px;
    }

    .loading {
      text-align: center;
      padding: 40px;
      color: #8b949e;
    }

    .error {
      background: #da3633;
      color: #fff;
      padding: 15px;
      border-radius: 6px;
      margin-bottom: 20px;
    }

    .no-data {
      text-align: center;
      padding: 60px 20px;
      color: #8b949e;
    }

    .no-data-icon {
      font-size: 48px;
      margin-bottom: 15px;
    }

    @media (max-width: 768px) {
      .image-comparison {
        grid-template-columns: 1fr;
      }

      .comparison-details {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🔍 PixelDust Diff Viewer</h1>
      <div class="session-info" id="sessionInfo">
        <span>Loading...</span>
      </div>
    </header>

    <div class="tabs">
      <button class="tab active" data-tab="comparisons">Comparisons</button>
      <button class="tab" data-tab="snapshots">Snapshots</button>
    </div>

    <div class="tab-content active" id="comparisons-tab">
      <div id="comparisonsList"></div>
      <div id="comparisonViewer" style="display: none;"></div>
    </div>

    <div class="tab-content" id="snapshots-tab">
      <div id="snapshotsList"></div>
    </div>
  </div>

  <script>
    // Get session ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session') || window.location.pathname.split('/').pop();

    if (!sessionId || sessionId === '') {
      document.querySelector('.container').innerHTML = \`
        <div class="error">
          <strong>Error:</strong> No session ID provided.
          Please use: <code>pixeldust show-diff &lt;session-id&gt;</code>
        </div>
      \`;
    } else {
      loadSession();
    }

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;

        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        tab.classList.add('active');
        document.getElementById(\`\${tabName}-tab\`).classList.add('active');

        if (tabName === 'comparisons') {
          loadComparisons();
        } else if (tabName === 'snapshots') {
          loadSnapshots();
        }
      });
    });

    async function loadSession() {
      try {
        const response = await fetch(\`/api/sessions/\${sessionId}\`);
        const session = await response.json();

        document.getElementById('sessionInfo').innerHTML = \`
          <span><strong>Session:</strong> \${session.id.substring(0, 8)}</span>
          <span><strong>State:</strong> \${session.state}</span>
          <span><strong>Created:</strong> \${new Date(session.createdAt).toLocaleString()}</span>
        \`;

        loadComparisons();
      } catch (error) {
        document.getElementById('sessionInfo').innerHTML = \`
          <span class="error">Failed to load session: \${error.message}</span>
        \`;
      }
    }

    async function loadComparisons() {
      const container = document.getElementById('comparisonsList');
      container.innerHTML = '<div class="loading">Loading comparisons...</div>';

      try {
        const response = await fetch(\`/api/sessions/\${sessionId}/comparisons\`);
        const comparisons = await response.json();

        if (comparisons.length === 0) {
          container.innerHTML = \`
            <div class="no-data">
              <div class="no-data-icon">📊</div>
              <p>No comparisons found for this session.</p>
              <p style="font-size: 14px; margin-top: 10px;">Comparisons are generated during test execution.</p>
            </div>
          \`;
          return;
        }

        container.innerHTML = '<div class="comparison-list"></div>';
        const list = container.querySelector('.comparison-list');

        comparisons.forEach(comparison => {
          const card = createComparisonCard(comparison);
          list.appendChild(card);
        });
      } catch (error) {
        container.innerHTML = \`<div class="error">Failed to load comparisons: \${error.message}</div>\`;
      }
    }

    function createComparisonCard(comparison) {
      const card = document.createElement('div');
      card.className = 'comparison-card';

      const score = comparison.similarityScore;
      const badge = score >= 90 ? 'similarity-high' : score >= 70 ? 'similarity-medium' : 'similarity-low';

      card.innerHTML = \`
        <div class="comparison-header">
          <div class="component-name">\${comparison.component}</div>
          <div class="similarity-badge \${badge}">\${score.toFixed(1)}% Similar</div>
        </div>
        <div class="comparison-details">
          <div class="detail-box">
            <div class="detail-label">Differences Found</div>
            <div class="detail-value">\${comparison.differencesFound}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Verdict</div>
            <div class="detail-value">\${comparison.verdict}</div>
          </div>
        </div>
      \`;

      card.addEventListener('click', () => showComparisonDetails(comparison));

      return card;
    }

    async function showComparisonDetails(comparison) {
      const viewer = document.getElementById('comparisonViewer');
      const list = document.getElementById('comparisonsList');

      list.style.display = 'none';
      viewer.style.display = 'block';

      viewer.innerHTML = '<div class="loading">Loading comparison details...</div>';

      try {
        const [baseSnapshot, targetSnapshot] = await Promise.all([
          fetch(\`/api/snapshots/\${comparison.baseSnapshotId}\`).then(r => r.json()),
          fetch(\`/api/snapshots/\${comparison.targetSnapshotId}\`).then(r => r.json())
        ]);

        viewer.innerHTML = \`
          <div class="comparison-viewer">
            <div class="viewer-controls">
              <button class="btn" onclick="backToList()">← Back to List</button>
              <button class="btn active" data-view="sidebyside">Side by Side</button>
              <button class="btn" data-view="overlay">Overlay</button>
            </div>

            <h2 class="section-title">\${comparison.component} Comparison</h2>

            <div class="diff-stats">
              <div class="stat-card">
                <div class="stat-label">Similarity Score</div>
                <div class="stat-value">\${comparison.similarityScore.toFixed(1)}%</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Differences Found</div>
                <div class="stat-value">\${comparison.differencesFound}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Verdict</div>
                <div class="stat-value" style="font-size: 18px;">\${comparison.verdict}</div>
              </div>
            </div>

            <div class="image-comparison">
              <div class="image-container">
                <div class="image-label">Base Version (\${baseSnapshot.version})</div>
                <img src="/api/snapshots/\${baseSnapshot.id}/screenshot" alt="Base" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22%3E%3Crect fill=%22%23161b22%22 width=%22400%22 height=%22300%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 fill=%22%238b949e%22 font-family=%22monospace%22%3ENo Screenshot%3C/text%3E%3C/svg%3E'" />
              </div>
              <div class="image-container">
                <div class="image-label">Target Version (\${targetSnapshot.version})</div>
                <img src="/api/snapshots/\${targetSnapshot.id}/screenshot" alt="Target" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22%3E%3Crect fill=%22%23161b22%22 width=%22400%22 height=%22300%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 fill=%22%238b949e%22 font-family=%22monospace%22%3ENo Screenshot%3C/text%3E%3C/svg%3E'" />
              </div>
            </div>

            \${comparison.domDiff ? renderDomDiff(comparison.domDiff) : ''}
            \${comparison.styleDiff ? renderStyleDiff(comparison.styleDiff) : ''}
          </div>
        \`;
      } catch (error) {
        viewer.innerHTML = \`<div class="error">Failed to load comparison details: \${error.message}</div>\`;
      }
    }

    function renderDomDiff(domDiff) {
      if (!domDiff.added && !domDiff.removed && !domDiff.modified) return '';

      let html = '<div class="dom-diff"><h3 class="section-title">DOM Changes</h3><div class="diff-tree">';

      if (domDiff.added && domDiff.added.length > 0) {
        html += '<div style="margin-bottom: 10px;"><strong>Added Elements:</strong></div>';
        domDiff.added.forEach(node => {
          html += \`<div class="diff-added">+ \${node.path || node.tagName}</div>\`;
        });
      }

      if (domDiff.removed && domDiff.removed.length > 0) {
        html += '<div style="margin-bottom: 10px; margin-top: 15px;"><strong>Removed Elements:</strong></div>';
        domDiff.removed.forEach(node => {
          html += \`<div class="diff-removed">- \${node.path || node.tagName}</div>\`;
        });
      }

      if (domDiff.modified && domDiff.modified.length > 0) {
        html += '<div style="margin-bottom: 10px; margin-top: 15px;"><strong>Modified Elements:</strong></div>';
        domDiff.modified.forEach(change => {
          html += \`<div class="diff-modified">~ \${change.path}: \${change.attribute}</div>\`;
        });
      }

      html += '</div></div>';
      return html;
    }

    function renderStyleDiff(styleDiff) {
      if (!styleDiff || Object.keys(styleDiff).length === 0) return '';

      let html = '<div class="dom-diff"><h3 class="section-title">Style Changes</h3><div class="diff-tree">';

      Object.entries(styleDiff).forEach(([selector, changes]) => {
        html += \`<div style="margin-bottom: 10px;"><strong>\${selector}</strong></div>\`;
        Object.entries(changes).forEach(([property, change]) => {
          html += \`<div class="diff-modified">  \${property}: \${change.oldValue} → \${change.newValue}</div>\`;
        });
      });

      html += '</div></div>';
      return html;
    }

    function backToList() {
      document.getElementById('comparisonViewer').style.display = 'none';
      document.getElementById('comparisonsList').style.display = 'block';
    }

    async function loadSnapshots() {
      const container = document.getElementById('snapshotsList');
      container.innerHTML = '<div class="loading">Loading snapshots...</div>';

      try {
        const response = await fetch(\`/api/sessions/\${sessionId}/snapshots\`);
        const snapshots = await response.json();

        if (snapshots.length === 0) {
          container.innerHTML = \`
            <div class="no-data">
              <div class="no-data-icon">📸</div>
              <p>No snapshots found for this session.</p>
            </div>
          \`;
          return;
        }

        container.innerHTML = '<div class="comparison-list"></div>';
        const list = container.querySelector('.comparison-list');

        snapshots.forEach(snapshot => {
          const card = createSnapshotCard(snapshot);
          list.appendChild(card);
        });
      } catch (error) {
        container.innerHTML = \`<div class="error">Failed to load snapshots: \${error.message}</div>\`;
      }
    }

    function createSnapshotCard(snapshot) {
      const card = document.createElement('div');
      card.className = 'comparison-card';

      card.innerHTML = \`
        <div class="comparison-header">
          <div class="component-name">\${snapshot.component}</div>
          <div class="similarity-badge similarity-high">\${snapshot.version}</div>
        </div>
        <div class="comparison-details">
          <div class="detail-box">
            <div class="detail-label">URL</div>
            <div class="detail-value" style="font-size: 12px; word-break: break-all;">\${snapshot.url}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Viewport</div>
            <div class="detail-value">\${snapshot.viewport}</div>
          </div>
        </div>
      \`;

      return card;
    }
  </script>
</body>
</html>`;
  }
}

export default WebServer;
