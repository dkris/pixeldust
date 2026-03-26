import Database from 'better-sqlite3';
import path from 'path';
import { Session, SessionState, TestResult, ComparisonResult, Remediation } from '../types';

/**
 * SQLite database manager for persistent state
 */
export class DatabaseManager {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const defaultPath = path.join(process.cwd(), 'data', 'pixeldust.db');
    this.db = new Database(dbPath || defaultPath);
    this.initialize();
  }

  private initialize() {
    // Create sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        config TEXT NOT NULL,
        versions TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        metadata TEXT
      )
    `);

    // Create test_runs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS test_runs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        test_id TEXT NOT NULL,
        version TEXT NOT NULL,
        status TEXT NOT NULL,
        duration INTEGER NOT NULL,
        error TEXT,
        screenshots TEXT,
        dom_snapshot TEXT,
        metrics TEXT,
        executed_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `);

    // Create comparisons table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS comparisons (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        base_version TEXT NOT NULL,
        target_version TEXT NOT NULL,
        component TEXT NOT NULL,
        differences TEXT NOT NULL,
        severity TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `);

    // Create remediations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS remediations (
        id TEXT PRIMARY KEY,
        comparison_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        proposal TEXT NOT NULL,
        status TEXT NOT NULL,
        implementation TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (comparison_id) REFERENCES comparisons(id),
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `);

    // Create test_suites table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS test_suites (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        version TEXT NOT NULL,
        component TEXT NOT NULL,
        tests TEXT NOT NULL,
        generated_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `);

    // Create snapshots table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS snapshots (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        version TEXT NOT NULL,
        component TEXT NOT NULL,
        url TEXT NOT NULL,
        viewport TEXT NOT NULL,
        screenshot_path TEXT,
        dom_snapshot TEXT,
        computed_styles TEXT,
        metrics TEXT,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `);

    // Create snapshot_comparisons table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS snapshot_comparisons (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        base_snapshot_id TEXT NOT NULL,
        target_snapshot_id TEXT NOT NULL,
        component TEXT NOT NULL,
        visual_diff TEXT,
        dom_diff TEXT,
        style_diff TEXT,
        similarity_score REAL NOT NULL,
        differences_found INTEGER NOT NULL,
        verdict TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id),
        FOREIGN KEY (base_snapshot_id) REFERENCES snapshots(id),
        FOREIGN KEY (target_snapshot_id) REFERENCES snapshots(id)
      )
    `);

    // Create evaluations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS evaluations (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        agent_type TEXT NOT NULL,
        metrics TEXT NOT NULL,
        feedback TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `);

    // Create test_templates table for test caching
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS test_templates (
        id TEXT PRIMARY KEY,
        component TEXT NOT NULL,
        framework_name TEXT NOT NULL,
        framework_version_range TEXT,
        test_code TEXT NOT NULL,
        test_metadata TEXT,
        hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER NOT NULL,
        usage_count INTEGER DEFAULT 1,
        UNIQUE(component, framework_name, hash)
      )
    `);

    // Create agent_memory table for persistent agent memory
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_memory (
        id TEXT PRIMARY KEY,
        agent_type TEXT NOT NULL,
        session_id TEXT,
        memory_type TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        context TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER,
        UNIQUE(agent_type, key)
      )
    `);

    // Create agent_executions table for observability
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_executions (
        id TEXT PRIMARY KEY,
        agent_type TEXT NOT NULL,
        session_id TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        tokens_used INTEGER,
        success INTEGER NOT NULL,
        error TEXT,
        metrics TEXT,
        executed_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `);

    // Create indices
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
      CREATE INDEX IF NOT EXISTS idx_test_runs_session ON test_runs(session_id);
      CREATE INDEX IF NOT EXISTS idx_comparisons_session ON comparisons(session_id);
      CREATE INDEX IF NOT EXISTS idx_remediations_session ON remediations(session_id);
      CREATE INDEX IF NOT EXISTS idx_remediations_status ON remediations(status);
      CREATE INDEX IF NOT EXISTS idx_test_suites_session ON test_suites(session_id);
      CREATE INDEX IF NOT EXISTS idx_test_suites_component ON test_suites(component);
      CREATE INDEX IF NOT EXISTS idx_snapshots_session ON snapshots(session_id);
      CREATE INDEX IF NOT EXISTS idx_snapshots_component ON snapshots(component);
      CREATE INDEX IF NOT EXISTS idx_snapshots_version ON snapshots(version);
      CREATE INDEX IF NOT EXISTS idx_snapshot_comparisons_session ON snapshot_comparisons(session_id);
      CREATE INDEX IF NOT EXISTS idx_snapshot_comparisons_component ON snapshot_comparisons(component);
      CREATE INDEX IF NOT EXISTS idx_evaluations_session ON evaluations(session_id);
      CREATE INDEX IF NOT EXISTS idx_evaluations_agent_type ON evaluations(agent_type);
      CREATE INDEX IF NOT EXISTS idx_test_templates_component ON test_templates(component);
      CREATE INDEX IF NOT EXISTS idx_test_templates_framework ON test_templates(framework_name);
      CREATE INDEX IF NOT EXISTS idx_test_templates_hash ON test_templates(hash);
      CREATE INDEX IF NOT EXISTS idx_agent_memory_type ON agent_memory(agent_type);
      CREATE INDEX IF NOT EXISTS idx_agent_memory_key ON agent_memory(key);
      CREATE INDEX IF NOT EXISTS idx_agent_executions_session ON agent_executions(session_id);
      CREATE INDEX IF NOT EXISTS idx_agent_executions_agent_type ON agent_executions(agent_type);
    `);

    this.initializeRuntimeTables();
  }

  // ============================================================================
  // Session Operations
  // ============================================================================

  createSession(session: Session): void {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, state, config, versions, created_at, updated_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      session.id,
      session.state,
      JSON.stringify(session.config),
      JSON.stringify(session.versions),
      session.createdAt.getTime(),
      session.updatedAt.getTime(),
      session.metadata ? JSON.stringify(session.metadata) : null
    );
  }

  getSession(id: string): Session | null {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      state: row.state as SessionState,
      config: JSON.parse(row.config),
      versions: JSON.parse(row.versions),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  getSessions(limit?: number): Session[] {
    const query = limit
      ? 'SELECT * FROM sessions ORDER BY created_at DESC LIMIT ?'
      : 'SELECT * FROM sessions ORDER BY created_at DESC';

    const stmt = this.db.prepare(query);
    const rows = limit ? stmt.all(limit) : stmt.all();

    return (rows as any[]).map(row => ({
      id: row.id,
      state: row.state as SessionState,
      config: JSON.parse(row.config),
      versions: JSON.parse(row.versions),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));
  }

  updateSessionState(id: string, state: SessionState): void {
    const stmt = this.db.prepare(`
      UPDATE sessions SET state = ?, updated_at = ? WHERE id = ?
    `);
    stmt.run(state, Date.now(), id);
  }

  listSessions(limit: number = 10): Session[] {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions ORDER BY created_at DESC LIMIT ?
    `);
    const rows = stmt.all(limit) as any[];

    return rows.map(row => ({
      id: row.id,
      state: row.state as SessionState,
      config: JSON.parse(row.config),
      versions: JSON.parse(row.versions),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));
  }

  // ============================================================================
  // Test Run Operations
  // ============================================================================

  saveTestResult(result: TestResult): void {
    const stmt = this.db.prepare(`
      INSERT INTO test_runs (
        id, session_id, test_id, version, status, duration, error,
        screenshots, dom_snapshot, metrics, executed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      result.id,
      result.sessionId,
      result.testId,
      result.version,
      result.status,
      result.duration,
      result.error || null,
      JSON.stringify(result.screenshots),
      result.domSnapshot || null,
      result.metrics ? JSON.stringify(result.metrics) : null,
      result.executedAt.getTime()
    );
  }

  getTestResults(sessionId: string, version?: string): TestResult[] {
    let stmt;
    let rows;

    if (version) {
      stmt = this.db.prepare(`
        SELECT * FROM test_runs WHERE session_id = ? AND version = ?
      `);
      rows = stmt.all(sessionId, version) as any[];
    } else {
      stmt = this.db.prepare(`
        SELECT * FROM test_runs WHERE session_id = ?
      `);
      rows = stmt.all(sessionId) as any[];
    }

    return rows.map(row => ({
      id: row.id,
      testId: row.test_id,
      sessionId: row.session_id,
      version: row.version,
      status: row.status as 'passed' | 'failed' | 'skipped',
      duration: row.duration,
      error: row.error || undefined,
      screenshots: JSON.parse(row.screenshots),
      domSnapshot: row.dom_snapshot || undefined,
      metrics: row.metrics ? JSON.parse(row.metrics) : undefined,
      executedAt: new Date(row.executed_at),
    }));
  }

  // ============================================================================
  // Comparison Operations
  // ============================================================================

  saveComparison(comparison: ComparisonResult): void {
    const stmt = this.db.prepare(`
      INSERT INTO comparisons (
        id, session_id, base_version, target_version, component,
        differences, severity, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      comparison.id,
      comparison.sessionId,
      comparison.baseVersion,
      comparison.targetVersion,
      comparison.component,
      JSON.stringify(comparison.differences),
      comparison.severity,
      comparison.createdAt.getTime()
    );
  }

  getComparisons(sessionId: string): ComparisonResult[] {
    const stmt = this.db.prepare(`
      SELECT * FROM comparisons WHERE session_id = ?
    `);
    const rows = stmt.all(sessionId) as any[];

    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      baseVersion: row.base_version,
      targetVersion: row.target_version,
      component: row.component,
      differences: JSON.parse(row.differences),
      severity: row.severity,
      createdAt: new Date(row.created_at),
    }));
  }

  // ============================================================================
  // Remediation Operations
  // ============================================================================

  saveRemediation(remediation: Remediation): void {
    const stmt = this.db.prepare(`
      INSERT INTO remediations (
        id, comparison_id, session_id, proposal, status,
        implementation, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      remediation.id,
      remediation.comparisonId,
      remediation.sessionId,
      JSON.stringify(remediation.proposal),
      remediation.status,
      remediation.implementation ? JSON.stringify(remediation.implementation) : null,
      remediation.createdAt.getTime(),
      remediation.updatedAt.getTime()
    );
  }

  updateRemediationStatus(id: string, status: string, implementation?: any): void {
    const stmt = this.db.prepare(`
      UPDATE remediations SET status = ?, implementation = ?, updated_at = ? WHERE id = ?
    `);
    stmt.run(
      status,
      implementation ? JSON.stringify(implementation) : null,
      Date.now(),
      id
    );
  }

  getRemediations(sessionId: string): Remediation[] {
    const stmt = this.db.prepare(`
      SELECT * FROM remediations WHERE session_id = ?
    `);
    const rows = stmt.all(sessionId) as any[];

    return rows.map(row => ({
      id: row.id,
      comparisonId: row.comparison_id,
      sessionId: row.session_id,
      proposal: JSON.parse(row.proposal),
      status: row.status,
      implementation: row.implementation ? JSON.parse(row.implementation) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  }

  // ============================================================================
  // Test Suite Operations
  // ============================================================================

  saveTestSuite(testSuite: any): void {
    const stmt = this.db.prepare(`
      INSERT INTO test_suites (id, session_id, version, component, tests, generated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      testSuite.id,
      testSuite.sessionId,
      testSuite.version,
      testSuite.component,
      JSON.stringify(testSuite.tests),
      testSuite.generatedAt.getTime()
    );
  }

  getTestSuites(sessionId: string): any[] {
    const stmt = this.db.prepare(`
      SELECT * FROM test_suites WHERE session_id = ? ORDER BY component
    `);
    const rows = stmt.all(sessionId) as any[];

    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      version: row.version,
      component: row.component,
      tests: JSON.parse(row.tests),
      generatedAt: new Date(row.generated_at),
    }));
  }

  getTestSuiteByComponent(sessionId: string, component: string): any | null {
    const stmt = this.db.prepare(`
      SELECT * FROM test_suites WHERE session_id = ? AND component = ?
    `);
    const row = stmt.get(sessionId, component) as any;

    if (!row) return null;

    return {
      id: row.id,
      sessionId: row.session_id,
      version: row.version,
      component: row.component,
      tests: JSON.parse(row.tests),
      generatedAt: new Date(row.generated_at),
    };
  }

  // ============================================================================
  // Snapshot Operations
  // ============================================================================

  saveSnapshot(snapshot: any): void {
    const stmt = this.db.prepare(`
      INSERT INTO snapshots (
        id, session_id, version, component, url, viewport,
        screenshot_path, dom_snapshot, computed_styles, metrics, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      snapshot.id,
      snapshot.sessionId,
      snapshot.version,
      snapshot.component,
      snapshot.url,
      JSON.stringify(snapshot.viewport),
      snapshot.screenshotPath,
      snapshot.domSnapshot,
      snapshot.computedStyles ? JSON.stringify(snapshot.computedStyles) : null,
      snapshot.metrics ? JSON.stringify(snapshot.metrics) : null,
      snapshot.timestamp || Date.now()
    );
  }

  getSnapshots(sessionId: string, version?: string, component?: string): any[] {
    let query = 'SELECT * FROM snapshots WHERE session_id = ?';
    const params: any[] = [sessionId];

    if (version) {
      query += ' AND version = ?';
      params.push(version);
    }

    if (component) {
      query += ' AND component = ?';
      params.push(component);
    }

    query += ' ORDER BY component, timestamp';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      version: row.version,
      component: row.component,
      url: row.url,
      viewport: JSON.parse(row.viewport),
      screenshotPath: row.screenshot_path,
      domSnapshot: row.dom_snapshot,
      computedStyles: row.computed_styles ? JSON.parse(row.computed_styles) : null,
      metrics: row.metrics ? JSON.parse(row.metrics) : null,
      timestamp: row.timestamp,
    }));
  }

  getSnapshot(id: string): any | null {
    const stmt = this.db.prepare('SELECT * FROM snapshots WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      sessionId: row.session_id,
      version: row.version,
      component: row.component,
      url: row.url,
      viewport: JSON.parse(row.viewport),
      screenshotPath: row.screenshot_path,
      domSnapshot: row.dom_snapshot,
      computedStyles: row.computed_styles ? JSON.parse(row.computed_styles) : null,
      metrics: row.metrics ? JSON.parse(row.metrics) : null,
      timestamp: row.timestamp,
    };
  }

  // ============================================================================
  // Snapshot Comparison Operations
  // ============================================================================

  saveSnapshotComparison(comparison: any): void {
    const stmt = this.db.prepare(`
      INSERT INTO snapshot_comparisons (
        id, session_id, base_snapshot_id, target_snapshot_id, component,
        visual_diff, dom_diff, style_diff, similarity_score,
        differences_found, verdict, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      comparison.id,
      comparison.sessionId,
      comparison.baseSnapshotId,
      comparison.targetSnapshotId,
      comparison.component,
      comparison.visualDiff ? JSON.stringify(comparison.visualDiff) : null,
      comparison.domDiff ? JSON.stringify(comparison.domDiff) : null,
      comparison.styleDiff ? JSON.stringify(comparison.styleDiff) : null,
      comparison.similarityScore,
      comparison.differencesFound,
      comparison.verdict,
      comparison.timestamp || Date.now()
    );
  }

  getSnapshotComparisons(sessionId: string, component?: string): any[] {
    let query = 'SELECT * FROM snapshot_comparisons WHERE session_id = ?';
    const params: any[] = [sessionId];

    if (component) {
      query += ' AND component = ?';
      params.push(component);
    }

    query += ' ORDER BY component, timestamp';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      baseSnapshotId: row.base_snapshot_id,
      targetSnapshotId: row.target_snapshot_id,
      component: row.component,
      visualDiff: row.visual_diff ? JSON.parse(row.visual_diff) : null,
      domDiff: row.dom_diff ? JSON.parse(row.dom_diff) : null,
      styleDiff: row.style_diff ? JSON.parse(row.style_diff) : null,
      similarityScore: row.similarity_score,
      differencesFound: row.differences_found,
      verdict: row.verdict,
      timestamp: row.timestamp,
    }));
  }

  getSnapshotComparison(id: string): any | null {
    const stmt = this.db.prepare('SELECT * FROM snapshot_comparisons WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      sessionId: row.session_id,
      baseSnapshotId: row.base_snapshot_id,
      targetSnapshotId: row.target_snapshot_id,
      component: row.component,
      visualDiff: row.visual_diff ? JSON.parse(row.visual_diff) : null,
      domDiff: row.dom_diff ? JSON.parse(row.dom_diff) : null,
      styleDiff: row.style_diff ? JSON.parse(row.style_diff) : null,
      similarityScore: row.similarity_score,
      differencesFound: row.differences_found,
      verdict: row.verdict,
      timestamp: row.timestamp,
    };
  }

  // ============================================================================
  // Evaluation Operations
  // ============================================================================

  saveEvaluation(evaluation: any): void {
    const stmt = this.db.prepare(`
      INSERT INTO evaluations (id, session_id, agent_type, metrics, feedback, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      evaluation.id,
      evaluation.sessionId,
      evaluation.agentType,
      JSON.stringify(evaluation.metrics),
      JSON.stringify(evaluation.feedback),
      evaluation.timestamp instanceof Date ? evaluation.timestamp.getTime() : evaluation.timestamp
    );
  }

  getEvaluations(sessionId: string, agentType?: string): any[] {
    let stmt;
    let rows;

    if (agentType) {
      stmt = this.db.prepare('SELECT * FROM evaluations WHERE session_id = ? AND agent_type = ? ORDER BY timestamp DESC');
      rows = stmt.all(sessionId, agentType);
    } else {
      stmt = this.db.prepare('SELECT * FROM evaluations WHERE session_id = ? ORDER BY timestamp DESC');
      rows = stmt.all(sessionId);
    }

    return (rows as any[]).map(row => ({
      id: row.id,
      sessionId: row.session_id,
      agentType: row.agent_type,
      metrics: JSON.parse(row.metrics),
      feedback: JSON.parse(row.feedback),
      timestamp: new Date(row.timestamp),
    }));
  }

  getEvaluation(id: string): any | null {
    const stmt = this.db.prepare('SELECT * FROM evaluations WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      sessionId: row.session_id,
      agentType: row.agent_type,
      metrics: JSON.parse(row.metrics),
      feedback: JSON.parse(row.feedback),
      timestamp: new Date(row.timestamp),
    };
  }

  getLatestEvaluation(sessionId: string): any | null {
    const stmt = this.db.prepare('SELECT * FROM evaluations WHERE session_id = ? ORDER BY timestamp DESC LIMIT 1');
    const row = stmt.get(sessionId) as any;

    if (!row) return null;

    return {
      id: row.id,
      sessionId: row.session_id,
      agentType: row.agent_type,
      metrics: JSON.parse(row.metrics),
      feedback: JSON.parse(row.feedback),
      timestamp: new Date(row.timestamp),
    };
  }

  // ============================================================================
  // Test Template Operations (for test caching)
  // ============================================================================

  saveTestTemplate(template: {
    id: string;
    component: string;
    frameworkName: string;
    frameworkVersionRange?: string;
    testCode: string;
    testMetadata?: any;
    hash: string;
  }): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO test_templates (
        id, component, framework_name, framework_version_range,
        test_code, test_metadata, hash, created_at, last_used_at, usage_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,
        COALESCE((SELECT usage_count + 1 FROM test_templates WHERE id = ?), 1)
      )
    `);

    const now = Date.now();
    stmt.run(
      template.id,
      template.component,
      template.frameworkName,
      template.frameworkVersionRange || null,
      template.testCode,
      template.testMetadata ? JSON.stringify(template.testMetadata) : null,
      template.hash,
      now,
      now,
      template.id
    );
  }

  getTestTemplate(component: string, frameworkName: string): any | null {
    const stmt = this.db.prepare(`
      SELECT * FROM test_templates
      WHERE component = ? AND framework_name = ?
      ORDER BY last_used_at DESC
      LIMIT 1
    `);
    const row = stmt.get(component, frameworkName) as any;

    if (!row) return null;

    return {
      id: row.id,
      component: row.component,
      frameworkName: row.framework_name,
      frameworkVersionRange: row.framework_version_range,
      testCode: row.test_code,
      testMetadata: row.test_metadata ? JSON.parse(row.test_metadata) : null,
      hash: row.hash,
      createdAt: new Date(row.created_at),
      lastUsedAt: new Date(row.last_used_at),
      usageCount: row.usage_count,
    };
  }

  updateTestTemplateUsage(id: string): void {
    const stmt = this.db.prepare(`
      UPDATE test_templates
      SET last_used_at = ?, usage_count = usage_count + 1
      WHERE id = ?
    `);
    stmt.run(Date.now(), id);
  }

  getTestTemplateStats(): any {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total_templates,
        SUM(usage_count) as total_uses,
        AVG(usage_count) as avg_uses_per_template
      FROM test_templates
    `);
    return stmt.get();
  }

  // ============================================================================
  // Agent Memory Operations
  // ============================================================================

  storeMemory(memory: {
    id: string;
    agentType: string;
    sessionId?: string;
    memoryType: 'short_term' | 'long_term' | 'episodic';
    key: string;
    value: any;
    context?: any;
    expiresAt?: number;
  }): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO agent_memory (
        id, agent_type, session_id, memory_type, key, value, context, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      memory.id,
      memory.agentType,
      memory.sessionId || null,
      memory.memoryType,
      memory.key,
      JSON.stringify(memory.value),
      memory.context ? JSON.stringify(memory.context) : null,
      Date.now(),
      memory.expiresAt || null
    );
  }

  recallMemory(agentType: string, key: string): any | null {
    const stmt = this.db.prepare(`
      SELECT * FROM agent_memory
      WHERE agent_type = ? AND key = ?
      AND (expires_at IS NULL OR expires_at > ?)
    `);
    const row = stmt.get(agentType, key, Date.now()) as any;

    if (!row) return null;

    return {
      id: row.id,
      agentType: row.agent_type,
      sessionId: row.session_id,
      memoryType: row.memory_type,
      key: row.key,
      value: JSON.parse(row.value),
      context: row.context ? JSON.parse(row.context) : null,
      createdAt: new Date(row.created_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    };
  }

  recallMemoriesByType(agentType: string, memoryType: string): any[] {
    const stmt = this.db.prepare(`
      SELECT * FROM agent_memory
      WHERE agent_type = ? AND memory_type = ?
      AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY created_at DESC
    `);
    const rows = stmt.all(agentType, memoryType, Date.now()) as any[];

    return rows.map(row => ({
      id: row.id,
      agentType: row.agent_type,
      sessionId: row.session_id,
      memoryType: row.memory_type,
      key: row.key,
      value: JSON.parse(row.value),
      context: row.context ? JSON.parse(row.context) : null,
      createdAt: new Date(row.created_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    }));
  }

  clearExpiredMemories(): number {
    const stmt = this.db.prepare(`
      DELETE FROM agent_memory WHERE expires_at IS NOT NULL AND expires_at < ?
    `);
    const result = stmt.run(Date.now());
    return result.changes;
  }

  // ============================================================================
  // Agent Execution Tracking (for observability)
  // ============================================================================

  trackAgentExecution(execution: {
    id: string;
    agentType: string;
    sessionId: string;
    durationMs: number;
    tokensUsed?: number;
    success: boolean;
    error?: string;
    metrics?: any;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO agent_executions (
        id, agent_type, session_id, duration_ms, tokens_used,
        success, error, metrics, executed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      execution.id,
      execution.agentType,
      execution.sessionId,
      execution.durationMs,
      execution.tokensUsed || null,
      execution.success ? 1 : 0,
      execution.error || null,
      execution.metrics ? JSON.stringify(execution.metrics) : null,
      Date.now()
    );
  }

  getAgentExecutions(sessionId: string, agentType?: string): any[] {
    let stmt;
    let rows;

    if (agentType) {
      stmt = this.db.prepare(`
        SELECT * FROM agent_executions
        WHERE session_id = ? AND agent_type = ?
        ORDER BY executed_at DESC
      `);
      rows = stmt.all(sessionId, agentType);
    } else {
      stmt = this.db.prepare(`
        SELECT * FROM agent_executions
        WHERE session_id = ?
        ORDER BY executed_at DESC
      `);
      rows = stmt.all(sessionId);
    }

    return (rows as any[]).map(row => ({
      id: row.id,
      agentType: row.agent_type,
      sessionId: row.session_id,
      durationMs: row.duration_ms,
      tokensUsed: row.tokens_used,
      success: row.success === 1,
      error: row.error,
      metrics: row.metrics ? JSON.parse(row.metrics) : null,
      executedAt: new Date(row.executed_at),
    }));
  }

  getAgentPerformanceStats(sessionId?: string): any {
    const query = sessionId
      ? `SELECT
          agent_type,
          COUNT(*) as execution_count,
          AVG(duration_ms) as avg_duration_ms,
          SUM(tokens_used) as total_tokens,
          AVG(tokens_used) as avg_tokens,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failure_count
        FROM agent_executions
        WHERE session_id = ?
        GROUP BY agent_type`
      : `SELECT
          agent_type,
          COUNT(*) as execution_count,
          AVG(duration_ms) as avg_duration_ms,
          SUM(tokens_used) as total_tokens,
          AVG(tokens_used) as avg_tokens,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failure_count
        FROM agent_executions
        GROUP BY agent_type`;

    const stmt = this.db.prepare(query);
    return sessionId ? stmt.all(sessionId) : stmt.all();
  }

  // ============================================================================
  // Runtime / App Immune System — Table Init & CRUD
  // ============================================================================

  initializeRuntimeTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        app_id TEXT NOT NULL,
        cohort_id TEXT,
        started_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        page_url TEXT NOT NULL,
        user_agent TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_user_sessions_app ON user_sessions(app_id);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_cohort ON user_sessions(cohort_id);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_started ON user_sessions(started_at);

      CREATE TABLE IF NOT EXISTS session_events (
        id TEXT PRIMARY KEY,
        user_session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        received_at INTEGER NOT NULL,
        url TEXT NOT NULL,
        selector TEXT,
        element_text TEXT,
        position TEXT,
        viewport TEXT,
        value TEXT,
        metadata TEXT,
        FOREIGN KEY (user_session_id) REFERENCES user_sessions(id)
      );
      CREATE INDEX IF NOT EXISTS idx_session_events_session ON session_events(user_session_id);
      CREATE INDEX IF NOT EXISTS idx_session_events_type ON session_events(type);
      CREATE INDEX IF NOT EXISTS idx_session_events_url ON session_events(url);
      CREATE INDEX IF NOT EXISTS idx_session_events_ts ON session_events(timestamp);

      CREATE TABLE IF NOT EXISTS friction_signals (
        id TEXT PRIMARY KEY,
        user_session_id TEXT NOT NULL,
        app_id TEXT NOT NULL,
        type TEXT NOT NULL,
        url TEXT NOT NULL,
        selector TEXT,
        element_text TEXT,
        count INTEGER NOT NULL DEFAULT 1,
        severity TEXT NOT NULL,
        context TEXT,
        detected_at INTEGER NOT NULL,
        FOREIGN KEY (user_session_id) REFERENCES user_sessions(id)
      );
      CREATE INDEX IF NOT EXISTS idx_friction_signals_app ON friction_signals(app_id);
      CREATE INDEX IF NOT EXISTS idx_friction_signals_type ON friction_signals(type);
      CREATE INDEX IF NOT EXISTS idx_friction_signals_url ON friction_signals(url);
      CREATE INDEX IF NOT EXISTS idx_friction_signals_detected ON friction_signals(detected_at);

      CREATE TABLE IF NOT EXISTS ui_mutations (
        id TEXT PRIMARY KEY,
        experiment_id TEXT NOT NULL,
        type TEXT NOT NULL,
        target_selector TEXT NOT NULL,
        css_rule TEXT,
        attribute_changes TEXT,
        new_content TEXT,
        script TEXT,
        description TEXT NOT NULL,
        generated_by TEXT NOT NULL DEFAULT 'claude',
        confidence REAL NOT NULL,
        friction_signal_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (friction_signal_id) REFERENCES friction_signals(id)
      );
      CREATE INDEX IF NOT EXISTS idx_ui_mutations_experiment ON ui_mutations(experiment_id);
      CREATE INDEX IF NOT EXISTS idx_ui_mutations_signal ON ui_mutations(friction_signal_id);

      CREATE TABLE IF NOT EXISTS experiments (
        id TEXT PRIMARY KEY,
        app_id TEXT NOT NULL,
        friction_signal_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        traffic_percent INTEGER NOT NULL DEFAULT 10,
        control_cohort_id TEXT NOT NULL,
        variant_cohort_id TEXT NOT NULL,
        min_confidence_threshold REAL NOT NULL DEFAULT 0.95,
        min_sample_size INTEGER NOT NULL DEFAULT 100,
        auto_promote INTEGER NOT NULL DEFAULT 0,
        auto_revert INTEGER NOT NULL DEFAULT 1,
        started_at INTEGER,
        ended_at INTEGER,
        promoted_at INTEGER,
        reverted_at INTEGER,
        description TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (friction_signal_id) REFERENCES friction_signals(id)
      );
      CREATE INDEX IF NOT EXISTS idx_experiments_app ON experiments(app_id);
      CREATE INDEX IF NOT EXISTS idx_experiments_status ON experiments(status);
      CREATE INDEX IF NOT EXISTS idx_experiments_signal ON experiments(friction_signal_id);

      CREATE TABLE IF NOT EXISTS experiment_outcomes (
        id TEXT PRIMARY KEY,
        experiment_id TEXT NOT NULL,
        measured_at INTEGER NOT NULL,
        control_sessions INTEGER NOT NULL DEFAULT 0,
        control_task_completion_rate REAL NOT NULL DEFAULT 0,
        control_error_rate REAL NOT NULL DEFAULT 0,
        control_abandonment_rate REAL NOT NULL DEFAULT 0,
        control_avg_session_duration REAL NOT NULL DEFAULT 0,
        variant_sessions INTEGER NOT NULL DEFAULT 0,
        variant_task_completion_rate REAL NOT NULL DEFAULT 0,
        variant_error_rate REAL NOT NULL DEFAULT 0,
        variant_abandonment_rate REAL NOT NULL DEFAULT 0,
        variant_avg_session_duration REAL NOT NULL DEFAULT 0,
        confidence_score REAL NOT NULL DEFAULT 0,
        p_value REAL,
        uplift REAL NOT NULL DEFAULT 0,
        decision TEXT NOT NULL DEFAULT 'insufficient_data',
        decision_reason TEXT,
        FOREIGN KEY (experiment_id) REFERENCES experiments(id)
      );
      CREATE INDEX IF NOT EXISTS idx_outcomes_experiment ON experiment_outcomes(experiment_id);
      CREATE INDEX IF NOT EXISTS idx_outcomes_measured ON experiment_outcomes(measured_at);

      CREATE TABLE IF NOT EXISTS cohort_assignments (
        user_session_id TEXT NOT NULL,
        experiment_id TEXT NOT NULL,
        cohort_id TEXT NOT NULL,
        assigned_at INTEGER NOT NULL,
        PRIMARY KEY (user_session_id, experiment_id),
        FOREIGN KEY (experiment_id) REFERENCES experiments(id)
      );
      CREATE INDEX IF NOT EXISTS idx_cohort_assignments_experiment ON cohort_assignments(experiment_id);
    `);
  }

  // --- UserSession ---

  upsertUserSession(session: {
    id: string; appId: string; cohortId?: string;
    startedAt: number; lastSeenAt: number;
    pageUrl: string; userAgent?: string; metadata?: Record<string, any>;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO user_sessions (id, app_id, cohort_id, started_at, last_seen_at, page_url, user_agent, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        last_seen_at = excluded.last_seen_at,
        cohort_id = COALESCE(excluded.cohort_id, cohort_id)
    `);
    stmt.run(
      session.id, session.appId, session.cohortId || null,
      session.startedAt, session.lastSeenAt, session.pageUrl,
      session.userAgent || null,
      session.metadata ? JSON.stringify(session.metadata) : null,
      Date.now()
    );
  }

  getUserSession(id: string): any | null {
    const row = (this.db.prepare('SELECT * FROM user_sessions WHERE id = ?').get(id)) as any;
    if (!row) return null;
    return {
      id: row.id, appId: row.app_id, cohortId: row.cohort_id,
      startedAt: row.started_at, lastSeenAt: row.last_seen_at,
      pageUrl: row.page_url, userAgent: row.user_agent,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  // --- SessionEvents ---

  saveSessionEvents(events: Array<{
    id: string; userSessionId: string; type: string;
    timestamp: number; receivedAt: number; url: string;
    selector?: string; elementText?: string;
    position?: { x: number; y: number };
    viewport?: { width: number; height: number };
    value?: string; metadata?: Record<string, any>;
  }>): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO session_events
        (id, user_session_id, type, timestamp, received_at, url,
         selector, element_text, position, viewport, value, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMany = this.db.transaction((evts: typeof events) => {
      for (const e of evts) {
        stmt.run(
          e.id, e.userSessionId, e.type, e.timestamp, e.receivedAt, e.url,
          e.selector || null, e.elementText || null,
          e.position ? JSON.stringify(e.position) : null,
          e.viewport ? JSON.stringify(e.viewport) : null,
          e.value || null,
          e.metadata ? JSON.stringify(e.metadata) : null
        );
      }
    });
    insertMany(events);
  }

  getSessionEvents(userSessionId: string, type?: string): any[] {
    const query = type
      ? 'SELECT * FROM session_events WHERE user_session_id = ? AND type = ? ORDER BY timestamp'
      : 'SELECT * FROM session_events WHERE user_session_id = ? ORDER BY timestamp';
    const rows = (type
      ? this.db.prepare(query).all(userSessionId, type)
      : this.db.prepare(query).all(userSessionId)) as any[];
    return rows.map(r => ({
      id: r.id, userSessionId: r.user_session_id, type: r.type,
      timestamp: r.timestamp, receivedAt: r.received_at, url: r.url,
      selector: r.selector, elementText: r.element_text,
      position: r.position ? JSON.parse(r.position) : undefined,
      viewport: r.viewport ? JSON.parse(r.viewport) : undefined,
      value: r.value,
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
    }));
  }

  countSessionEventsByType(appId: string, type: string, url: string, since: number): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as cnt FROM session_events se
      JOIN user_sessions us ON se.user_session_id = us.id
      WHERE us.app_id = ? AND se.type = ? AND se.url = ? AND se.timestamp >= ?
    `);
    const row = stmt.get(appId, type, url, since) as any;
    return row?.cnt ?? 0;
  }

  // --- FrictionSignals ---

  saveFrictionSignal(signal: {
    id: string; userSessionId: string; appId: string; type: string;
    url: string; selector?: string; elementText?: string; count: number;
    severity: string; context?: Record<string, any>; detectedAt: number;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO friction_signals
        (id, user_session_id, app_id, type, url, selector, element_text,
         count, severity, context, detected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      signal.id, signal.userSessionId, signal.appId, signal.type, signal.url,
      signal.selector || null, signal.elementText || null, signal.count, signal.severity,
      signal.context ? JSON.stringify(signal.context) : null, signal.detectedAt
    );
  }

  getFrictionSignals(appId: string, since?: number): any[] {
    const query = since
      ? 'SELECT * FROM friction_signals WHERE app_id = ? AND detected_at >= ? ORDER BY detected_at DESC'
      : 'SELECT * FROM friction_signals WHERE app_id = ? ORDER BY detected_at DESC';
    const rows = (since
      ? this.db.prepare(query).all(appId, since)
      : this.db.prepare(query).all(appId)) as any[];
    return rows.map(r => ({
      id: r.id, userSessionId: r.user_session_id, appId: r.app_id,
      type: r.type, url: r.url, selector: r.selector, elementText: r.element_text,
      count: r.count, severity: r.severity,
      context: r.context ? JSON.parse(r.context) : undefined,
      detectedAt: r.detected_at,
    }));
  }

  getFrictionSignal(id: string): any | null {
    const row = (this.db.prepare('SELECT * FROM friction_signals WHERE id = ?').get(id)) as any;
    if (!row) return null;
    return {
      id: row.id, userSessionId: row.user_session_id, appId: row.app_id,
      type: row.type, url: row.url, selector: row.selector, elementText: row.element_text,
      count: row.count, severity: row.severity,
      context: row.context ? JSON.parse(row.context) : undefined,
      detectedAt: row.detected_at,
    };
  }

  // --- UIMutations ---

  saveUIMutation(mutation: {
    id: string; experimentId: string; type: string; targetSelector: string;
    cssRule?: string; attributeChanges?: Record<string, string>;
    newContent?: string; script?: string; description: string;
    generatedBy: string; confidence: number; frictionSignalId: string; createdAt: number;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO ui_mutations
        (id, experiment_id, type, target_selector, css_rule, attribute_changes,
         new_content, script, description, generated_by, confidence, friction_signal_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      mutation.id, mutation.experimentId, mutation.type, mutation.targetSelector,
      mutation.cssRule || null,
      mutation.attributeChanges ? JSON.stringify(mutation.attributeChanges) : null,
      mutation.newContent || null, mutation.script || null, mutation.description,
      mutation.generatedBy, mutation.confidence, mutation.frictionSignalId, mutation.createdAt
    );
  }

  getUIMutations(experimentId: string): any[] {
    const rows = this.db.prepare(
      'SELECT * FROM ui_mutations WHERE experiment_id = ? ORDER BY created_at'
    ).all(experimentId) as any[];
    return rows.map(r => ({
      id: r.id, experimentId: r.experiment_id, type: r.type,
      targetSelector: r.target_selector, cssRule: r.css_rule,
      attributeChanges: r.attribute_changes ? JSON.parse(r.attribute_changes) : undefined,
      newContent: r.new_content, script: r.script, description: r.description,
      generatedBy: r.generated_by, confidence: r.confidence,
      frictionSignalId: r.friction_signal_id, createdAt: r.created_at,
    }));
  }

  // --- Experiments ---

  saveExperiment(exp: {
    id: string; appId: string; frictionSignalId: string; status: string;
    trafficPercent: number; controlCohortId: string; variantCohortId: string;
    minConfidenceThreshold: number; minSampleSize: number;
    autoPromote: boolean; autoRevert: boolean;
    startedAt?: number; endedAt?: number; promotedAt?: number; revertedAt?: number;
    description?: string; createdAt: number; updatedAt: number;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO experiments
        (id, app_id, friction_signal_id, status, traffic_percent,
         control_cohort_id, variant_cohort_id, min_confidence_threshold, min_sample_size,
         auto_promote, auto_revert, started_at, ended_at, promoted_at, reverted_at,
         description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      exp.id, exp.appId, exp.frictionSignalId, exp.status, exp.trafficPercent,
      exp.controlCohortId, exp.variantCohortId, exp.minConfidenceThreshold, exp.minSampleSize,
      exp.autoPromote ? 1 : 0, exp.autoRevert ? 1 : 0,
      exp.startedAt || null, exp.endedAt || null, exp.promotedAt || null, exp.revertedAt || null,
      exp.description || null, exp.createdAt, exp.updatedAt
    );
  }

  updateExperimentStatus(id: string, status: string, extra?: {
    startedAt?: number; endedAt?: number; promotedAt?: number; revertedAt?: number;
  }): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      UPDATE experiments SET status = ?, updated_at = ?,
        started_at = COALESCE(?, started_at),
        ended_at = COALESCE(?, ended_at),
        promoted_at = COALESCE(?, promoted_at),
        reverted_at = COALESCE(?, reverted_at)
      WHERE id = ?
    `);
    stmt.run(
      status, now,
      extra?.startedAt || null, extra?.endedAt || null,
      extra?.promotedAt || null, extra?.revertedAt || null,
      id
    );
  }

  updateExperimentConfig(id: string, config: {
    trafficPercent?: number; autoPromote?: boolean; autoRevert?: boolean;
  }): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      UPDATE experiments SET
        traffic_percent = COALESCE(?, traffic_percent),
        auto_promote = COALESCE(?, auto_promote),
        auto_revert = COALESCE(?, auto_revert),
        updated_at = ?
      WHERE id = ?
    `);
    stmt.run(
      config.trafficPercent ?? null,
      config.autoPromote !== undefined ? (config.autoPromote ? 1 : 0) : null,
      config.autoRevert !== undefined ? (config.autoRevert ? 1 : 0) : null,
      now, id
    );
  }

  getExperiment(id: string): any | null {
    const row = (this.db.prepare('SELECT * FROM experiments WHERE id = ?').get(id)) as any;
    if (!row) return null;
    return this.mapExperimentRow(row);
  }

  getExperiments(appId: string, status?: string): any[] {
    const query = status
      ? 'SELECT * FROM experiments WHERE app_id = ? AND status = ? ORDER BY created_at DESC'
      : 'SELECT * FROM experiments WHERE app_id = ? ORDER BY created_at DESC';
    const rows = (status
      ? this.db.prepare(query).all(appId, status)
      : this.db.prepare(query).all(appId)) as any[];
    return rows.map(r => this.mapExperimentRow(r));
  }

  private mapExperimentRow(row: any): any {
    return {
      id: row.id, appId: row.app_id, frictionSignalId: row.friction_signal_id,
      status: row.status, trafficPercent: row.traffic_percent,
      controlCohortId: row.control_cohort_id, variantCohortId: row.variant_cohort_id,
      minConfidenceThreshold: row.min_confidence_threshold, minSampleSize: row.min_sample_size,
      autoPromote: row.auto_promote === 1, autoRevert: row.auto_revert === 1,
      startedAt: row.started_at, endedAt: row.ended_at,
      promotedAt: row.promoted_at, revertedAt: row.reverted_at,
      description: row.description, createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  // --- ExperimentOutcomes ---

  saveExperimentOutcome(outcome: {
    id: string; experimentId: string; measuredAt: number;
    controlSessions: number; controlTaskCompletionRate: number;
    controlErrorRate: number; controlAbandonmentRate: number; controlAvgSessionDuration: number;
    variantSessions: number; variantTaskCompletionRate: number;
    variantErrorRate: number; variantAbandonmentRate: number; variantAvgSessionDuration: number;
    confidenceScore: number; pValue?: number; uplift: number;
    decision: string; decisionReason?: string;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO experiment_outcomes
        (id, experiment_id, measured_at,
         control_sessions, control_task_completion_rate, control_error_rate,
         control_abandonment_rate, control_avg_session_duration,
         variant_sessions, variant_task_completion_rate, variant_error_rate,
         variant_abandonment_rate, variant_avg_session_duration,
         confidence_score, p_value, uplift, decision, decision_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      outcome.id, outcome.experimentId, outcome.measuredAt,
      outcome.controlSessions, outcome.controlTaskCompletionRate, outcome.controlErrorRate,
      outcome.controlAbandonmentRate, outcome.controlAvgSessionDuration,
      outcome.variantSessions, outcome.variantTaskCompletionRate, outcome.variantErrorRate,
      outcome.variantAbandonmentRate, outcome.variantAvgSessionDuration,
      outcome.confidenceScore, outcome.pValue ?? null, outcome.uplift,
      outcome.decision, outcome.decisionReason || null
    );
  }

  getExperimentOutcomes(experimentId: string): any[] {
    const rows = this.db.prepare(
      'SELECT * FROM experiment_outcomes WHERE experiment_id = ? ORDER BY measured_at'
    ).all(experimentId) as any[];
    return rows.map(r => ({
      id: r.id, experimentId: r.experiment_id, measuredAt: r.measured_at,
      controlSessions: r.control_sessions,
      controlTaskCompletionRate: r.control_task_completion_rate,
      controlErrorRate: r.control_error_rate,
      controlAbandonmentRate: r.control_abandonment_rate,
      controlAvgSessionDuration: r.control_avg_session_duration,
      variantSessions: r.variant_sessions,
      variantTaskCompletionRate: r.variant_task_completion_rate,
      variantErrorRate: r.variant_error_rate,
      variantAbandonmentRate: r.variant_abandonment_rate,
      variantAvgSessionDuration: r.variant_avg_session_duration,
      confidenceScore: r.confidence_score, pValue: r.p_value,
      uplift: r.uplift, decision: r.decision, decisionReason: r.decision_reason,
    }));
  }

  getLatestExperimentOutcome(experimentId: string): any | null {
    const row = this.db.prepare(
      'SELECT * FROM experiment_outcomes WHERE experiment_id = ? ORDER BY measured_at DESC LIMIT 1'
    ).get(experimentId) as any;
    if (!row) return null;
    return {
      id: row.id, experimentId: row.experiment_id, measuredAt: row.measured_at,
      controlSessions: row.control_sessions,
      controlTaskCompletionRate: row.control_task_completion_rate,
      controlErrorRate: row.control_error_rate,
      controlAbandonmentRate: row.control_abandonment_rate,
      controlAvgSessionDuration: row.control_avg_session_duration,
      variantSessions: row.variant_sessions,
      variantTaskCompletionRate: row.variant_task_completion_rate,
      variantErrorRate: row.variant_error_rate,
      variantAbandonmentRate: row.variant_abandonment_rate,
      variantAvgSessionDuration: row.variant_avg_session_duration,
      confidenceScore: row.confidence_score, pValue: row.p_value,
      uplift: row.uplift, decision: row.decision, decisionReason: row.decision_reason,
    };
  }

  // --- CohortAssignments ---

  saveCohortAssignment(assignment: {
    userSessionId: string; experimentId: string; cohortId: string; assignedAt: number;
  }): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO cohort_assignments
        (user_session_id, experiment_id, cohort_id, assigned_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(assignment.userSessionId, assignment.experimentId, assignment.cohortId, assignment.assignedAt);
  }

  getCohortAssignment(userSessionId: string, experimentId: string): any | null {
    const row = this.db.prepare(
      'SELECT * FROM cohort_assignments WHERE user_session_id = ? AND experiment_id = ?'
    ).get(userSessionId, experimentId) as any;
    if (!row) return null;
    return {
      userSessionId: row.user_session_id, experimentId: row.experiment_id,
      cohortId: row.cohort_id, assignedAt: row.assigned_at,
    };
  }

  getCohortSessionIds(experimentId: string, cohortId: string): string[] {
    const rows = this.db.prepare(
      'SELECT user_session_id FROM cohort_assignments WHERE experiment_id = ? AND cohort_id = ?'
    ).all(experimentId, cohortId) as any[];
    return rows.map(r => r.user_session_id);
  }

  getDashboardSummary(appId: string): {
    activeExperiments: number;
    pendingSignals: number;
    recentDecisions: any[];
    overallUplift: number;
  } {
    const active = (this.db.prepare(
      "SELECT COUNT(*) as cnt FROM experiments WHERE app_id = ? AND status = 'RUNNING'"
    ).get(appId) as any)?.cnt ?? 0;

    const pending = (this.db.prepare(
      'SELECT COUNT(*) as cnt FROM friction_signals WHERE app_id = ? AND detected_at > ?'
    ).get(appId, Date.now() - 24 * 60 * 60 * 1000) as any)?.cnt ?? 0;

    const recentDecisions = this.db.prepare(`
      SELECT e.id, e.status, eo.decision, eo.uplift, eo.confidence_score, eo.measured_at
      FROM experiments e
      JOIN experiment_outcomes eo ON eo.experiment_id = e.id
      WHERE e.app_id = ? AND eo.decision IN ('promote','revert')
      ORDER BY eo.measured_at DESC LIMIT 10
    `).all(appId) as any[];

    const upliftRow = this.db.prepare(`
      SELECT AVG(eo.uplift) as avg_uplift
      FROM experiments e
      JOIN experiment_outcomes eo ON eo.experiment_id = e.id
      WHERE e.app_id = ? AND e.status = 'PROMOTED'
    `).get(appId) as any;

    return {
      activeExperiments: active,
      pendingSignals: pending,
      recentDecisions,
      overallUplift: upliftRow?.avg_uplift ?? 0,
    };
  }

  close(): void {
    this.db.close();
  }
}

export default DatabaseManager;
