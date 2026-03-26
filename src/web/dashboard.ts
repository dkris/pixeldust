/**
 * Autonomy Dashboard HTML generator
 *
 * Renders a real-time view of active experiments, friction signals,
 * confidence scores, and override controls. Mirrors the existing
 * generateFrontendHTML() pattern in server.ts.
 */

export function generateDashboardHTML(appId: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pixeldust — Autonomy Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f1117; color: #e2e8f0; min-height: 100vh;
    }
    header {
      background: #1a1d2e; border-bottom: 1px solid #2d3748;
      padding: 16px 24px; display: flex; align-items: center; gap: 12px;
    }
    header h1 { font-size: 1.25rem; font-weight: 700; color: #a78bfa; }
    header .app-id { font-size: 0.85rem; color: #718096; }
    header .status-dot {
      width: 8px; height: 8px; border-radius: 50%; background: #48bb78;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; } 50% { opacity: 0.4; }
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
    .summary-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px; margin-bottom: 32px;
    }
    .summary-card {
      background: #1a1d2e; border: 1px solid #2d3748; border-radius: 8px;
      padding: 20px;
    }
    .summary-card .label { font-size: 0.75rem; color: #718096; text-transform: uppercase; letter-spacing: 0.05em; }
    .summary-card .value { font-size: 2rem; font-weight: 700; margin-top: 8px; }
    .summary-card .value.green { color: #48bb78; }
    .summary-card .value.yellow { color: #ecc94b; }
    .summary-card .value.red { color: #fc8181; }
    .summary-card .value.purple { color: #a78bfa; }
    section { margin-bottom: 32px; }
    section h2 { font-size: 1rem; font-weight: 600; color: #a0aec0; margin-bottom: 16px; }
    .card {
      background: #1a1d2e; border: 1px solid #2d3748; border-radius: 8px;
      padding: 20px; margin-bottom: 12px;
    }
    .card-header { display: flex; justify-content: space-between; align-items: flex-start; }
    .card-title { font-size: 0.95rem; font-weight: 600; }
    .badge {
      font-size: 0.7rem; padding: 3px 8px; border-radius: 9999px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.05em;
    }
    .badge-running { background: #2d3748; color: #68d391; border: 1px solid #48bb78; }
    .badge-promoted { background: #1c4532; color: #68d391; border: 1px solid #38a169; }
    .badge-reverted { background: #3d1515; color: #fc8181; border: 1px solid #e53e3e; }
    .badge-draft { background: #2d3748; color: #a0aec0; border: 1px solid #4a5568; }
    .badge-critical { background: #3d1515; color: #fc8181; }
    .badge-high { background: #3d2a15; color: #f6ad55; }
    .badge-medium { background: #3d3415; color: #ecc94b; }
    .metrics-row {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px; margin-top: 16px;
    }
    .metric { }
    .metric .m-label { font-size: 0.72rem; color: #718096; }
    .metric .m-val { font-size: 1.1rem; font-weight: 600; margin-top: 4px; }
    .confidence-bar-wrap { margin-top: 12px; }
    .confidence-bar-wrap .bar-label {
      font-size: 0.72rem; color: #718096; display: flex; justify-content: space-between;
    }
    .confidence-bar {
      height: 6px; border-radius: 3px; background: #2d3748; margin-top: 4px; overflow: hidden;
    }
    .confidence-bar-fill { height: 100%; border-radius: 3px; transition: width 0.5s; }
    .actions { margin-top: 16px; display: flex; gap: 8px; }
    button {
      padding: 7px 16px; border-radius: 6px; font-size: 0.8rem; font-weight: 600;
      cursor: pointer; border: none; transition: opacity 0.15s;
    }
    button:hover { opacity: 0.85; }
    button:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-promote { background: #38a169; color: #fff; }
    .btn-revert  { background: #e53e3e; color: #fff; }
    .btn-pause   { background: #4a5568; color: #e2e8f0; }
    .friction-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #2d3748; }
    .friction-item:last-child { border-bottom: none; }
    .friction-type { font-size: 0.85rem; font-weight: 600; color: #a78bfa; }
    .friction-meta { font-size: 0.75rem; color: #718096; margin-top: 2px; }
    .empty-state { text-align: center; padding: 40px; color: #4a5568; font-size: 0.9rem; }
    .refresh-btn {
      float: right; background: #2d3748; color: #a0aec0; padding: 6px 14px;
      border-radius: 6px; font-size: 0.78rem; cursor: pointer; border: none;
    }
    .refresh-btn:hover { background: #4a5568; }
    .decision-reason {
      font-size: 0.78rem; color: #718096; margin-top: 8px; font-style: italic;
    }
    #toast {
      position: fixed; bottom: 24px; right: 24px; background: #2d3748; color: #e2e8f0;
      padding: 12px 20px; border-radius: 8px; font-size: 0.85rem;
      opacity: 0; transform: translateY(8px); transition: all 0.2s; pointer-events: none;
      border-left: 3px solid #a78bfa;
    }
    #toast.show { opacity: 1; transform: translateY(0); }
  </style>
</head>
<body>
  <header>
    <div class="status-dot" id="statusDot"></div>
    <h1>Pixeldust Autonomy</h1>
    <span class="app-id">app: ${escapeHtml(appId)}</span>
    <button class="refresh-btn" onclick="loadAll()">↺ Refresh</button>
  </header>

  <div class="container">
    <div class="summary-grid" id="summaryGrid">
      <div class="summary-card"><div class="label">Active Experiments</div><div class="value purple" id="sumActive">—</div></div>
      <div class="summary-card"><div class="label">Pending Signals</div><div class="value yellow" id="sumSignals">—</div></div>
      <div class="summary-card"><div class="label">Overall Uplift</div><div class="value green" id="sumUplift">—</div></div>
      <div class="summary-card"><div class="label">Auto-Promoted</div><div class="value green" id="sumPromoted">—</div></div>
    </div>

    <section>
      <h2>Active Experiments</h2>
      <div id="experimentsList"><div class="empty-state">Loading…</div></div>
    </section>

    <section>
      <h2>Recent Friction Signals</h2>
      <div class="card" id="frictionList"><div class="empty-state">Loading…</div></div>
    </section>
  </div>

  <div id="toast"></div>

  <script>
    const APP_ID = ${JSON.stringify(appId)};
    const BASE = '';

    function escHtml(s) {
      return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function pct(n) { return (n * 100).toFixed(1) + '%'; }

    function badgeClass(status) {
      return {
        RUNNING: 'badge-running', PROMOTED: 'badge-promoted',
        REVERTED: 'badge-reverted', DRAFT: 'badge-draft',
      }[status] || 'badge-draft';
    }

    function severityClass(s) {
      return { critical: 'badge-critical', high: 'badge-high', medium: 'badge-medium' }[s?.toLowerCase()] || '';
    }

    async function api(path) {
      try {
        const r = await fetch(BASE + path);
        if (!r.ok) throw new Error(r.statusText);
        return r.json();
      } catch(e) { return null; }
    }

    async function postApi(path, body) {
      try {
        const r = await fetch(BASE + path, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error(r.statusText);
        return r.json();
      } catch(e) { return null; }
    }

    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 3000);
    }

    async function promote(id) {
      const reason = prompt('Promote reason (optional):') || 'manual override';
      const r = await postApi('/api/experiments/' + id + '/promote', { reason });
      showToast(r ? 'Experiment promoted.' : 'Promote failed.');
      loadAll();
    }

    async function revert(id) {
      if (!confirm('Revert this experiment?')) return;
      const reason = prompt('Revert reason (optional):') || 'manual override';
      const r = await postApi('/api/experiments/' + id + '/revert', { reason });
      showToast(r ? 'Experiment reverted.' : 'Revert failed.');
      loadAll();
    }

    async function pause(id) {
      const r = await postApi('/api/experiments/' + id + '/pause', {});
      showToast(r ? 'Experiment paused.' : 'Pause failed.');
      loadAll();
    }

    function renderConfidenceBar(score) {
      const pctVal = (score * 100).toFixed(0);
      const color = score >= 0.95 ? '#48bb78' : score >= 0.75 ? '#ecc94b' : '#fc8181';
      return \`<div class="confidence-bar-wrap">
        <div class="bar-label"><span>Bayesian Confidence</span><span>\${pctVal}%</span></div>
        <div class="confidence-bar">
          <div class="confidence-bar-fill" style="width:\${pctVal}%;background:\${color}"></div>
        </div>
      </div>\`;
    }

    function renderExperiment(exp, outcome) {
      const isRunning = exp.status === 'RUNNING';
      const upliftVal = outcome ? (outcome.uplift * 100).toFixed(1) + '%' : '—';
      const upliftColor = outcome ? (outcome.uplift > 0 ? '#48bb78' : '#fc8181') : '#a0aec0';
      const conf = outcome ? outcome.confidenceScore : 0;

      return \`<div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">\${escHtml(exp.description || exp.id)}</div>
            <div style="font-size:0.72rem;color:#718096;margin-top:4px">id: \${escHtml(exp.id)}</div>
          </div>
          <span class="badge \${badgeClass(exp.status)}">\${escHtml(exp.status)}</span>
        </div>
        <div class="metrics-row">
          <div class="metric"><div class="m-label">Traffic</div><div class="m-val">\${exp.trafficPercent}%</div></div>
          <div class="metric"><div class="m-label">Control Sessions</div><div class="m-val">\${outcome ? outcome.controlSessions : '—'}</div></div>
          <div class="metric"><div class="m-label">Variant Sessions</div><div class="m-val">\${outcome ? outcome.variantSessions : '—'}</div></div>
          <div class="metric"><div class="m-label">Uplift</div><div class="m-val" style="color:\${upliftColor}">\${upliftVal}</div></div>
          <div class="metric"><div class="m-label">Completion ↑</div><div class="m-val">\${outcome ? pct(outcome.variantTaskCompletionRate) : '—'}</div></div>
          <div class="metric"><div class="m-label">Decision</div><div class="m-val" style="font-size:0.85rem">\${outcome ? escHtml(outcome.decision) : '—'}</div></div>
        </div>
        \${outcome ? renderConfidenceBar(conf) : ''}
        \${outcome?.decisionReason ? \`<div class="decision-reason">\${escHtml(outcome.decisionReason)}</div>\` : ''}
        \${isRunning ? \`<div class="actions">
          <button class="btn-promote" onclick="promote('\${escHtml(exp.id)}')">Promote</button>
          <button class="btn-revert"  onclick="revert('\${escHtml(exp.id)}')">Revert</button>
          <button class="btn-pause"   onclick="pause('\${escHtml(exp.id)}')">Pause</button>
        </div>\` : ''}
      </div>\`;
    }

    async function loadExperiments() {
      const data = await api('/api/experiments?appId=' + encodeURIComponent(APP_ID));
      const el = document.getElementById('experimentsList');
      if (!data || !data.experiments || data.experiments.length === 0) {
        el.innerHTML = '<div class="empty-state">No experiments yet.</div>';
        return;
      }
      const items = await Promise.all(data.experiments.map(async (exp) => {
        const od = await api('/api/experiments/' + exp.id + '/outcomes');
        const outcome = od?.outcomes?.[0] || null;
        return renderExperiment(exp, outcome);
      }));
      el.innerHTML = items.join('');
    }

    async function loadFriction() {
      const since = Date.now() - 24 * 60 * 60 * 1000; // last 24h
      const data = await api('/api/friction?appId=' + encodeURIComponent(APP_ID) + '&since=' + since);
      const el = document.getElementById('frictionList');
      if (!data || !data.signals || data.signals.length === 0) {
        el.innerHTML = '<div class="empty-state">No friction signals in the last 24 hours.</div>';
        return;
      }
      const items = data.signals.slice(0, 20).map(s => \`
        <div class="friction-item">
          <div>
            <div class="friction-type">\${escHtml(s.type)}</div>
            <div class="friction-meta">\${escHtml(s.url)} · count: \${s.count}</div>
          </div>
          <span class="badge \${severityClass(s.severity)}">\${escHtml(s.severity)}</span>
        </div>
      \`).join('');
      el.innerHTML = items;
    }

    async function loadSummary() {
      const data = await api('/api/dashboard/summary?appId=' + encodeURIComponent(APP_ID));
      if (!data) return;
      document.getElementById('sumActive').textContent   = data.activeExperiments ?? '0';
      document.getElementById('sumSignals').textContent  = data.pendingSignals ?? '0';
      const u = data.overallUplift;
      document.getElementById('sumUplift').textContent   = u != null ? (u * 100).toFixed(1) + '%' : '—';
      document.getElementById('sumPromoted').textContent = data.recentDecisions?.promoted ?? '0';
    }

    async function loadAll() {
      await Promise.all([loadSummary(), loadExperiments(), loadFriction()]);
    }

    // Auto-refresh every 30 s
    loadAll();
    setInterval(loadAll, 30000);
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export default generateDashboardHTML;
