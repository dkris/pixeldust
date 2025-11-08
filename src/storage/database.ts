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

    // Create indices
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
      CREATE INDEX IF NOT EXISTS idx_test_runs_session ON test_runs(session_id);
      CREATE INDEX IF NOT EXISTS idx_comparisons_session ON comparisons(session_id);
      CREATE INDEX IF NOT EXISTS idx_remediations_session ON remediations(session_id);
      CREATE INDEX IF NOT EXISTS idx_remediations_status ON remediations(status);
    `);
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

  close(): void {
    this.db.close();
  }
}

export default DatabaseManager;
