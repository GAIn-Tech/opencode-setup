const { join } = require('path');
const { existsSync, mkdirSync, readFileSync } = require('fs');
const { v4: uuidv4 } = require('uuid');

let Database;
const isBun = typeof Bun !== 'undefined';

if (isBun) {
  Database = require('bun:sqlite').Database;
} else {
  Database = require('better-sqlite3');
}

class WorkflowStore {
  constructor(dbPath) {
    if (!dbPath) {
      const configDir = join(process.env.HOME || process.env.USERPROFILE, '.opencode');
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }
      dbPath = join(configDir, 'sisyphus-state.db');
    }

    this.db = new Database(dbPath);
    if (isBun) {
      this.db.exec('PRAGMA journal_mode = WAL');
      this.db.exec('PRAGMA busy_timeout = 5000');
    } else {
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('busy_timeout = 5000');
    }
    this.init();
  }

  init() {
    // In Bun, exec can return the query result, but here we just want execution
    const run = (sql) => this.db.exec(sql); // bun:sqlite has exec, better-sqlite3 has exec
    
    run(`
      CREATE TABLE IF NOT EXISTS workflow_runs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed')),
        input TEXT NOT NULL,
        context TEXT NOT NULL DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS workflow_steps (
        run_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed')),
        result TEXT,
        attempts INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (run_id, step_id),
        FOREIGN KEY (run_id) REFERENCES workflow_runs(id)
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (run_id) REFERENCES workflow_runs(id)
      );

      CREATE INDEX IF NOT EXISTS idx_audit_run ON audit_events(run_id);
      CREATE INDEX IF NOT EXISTS idx_steps_run ON workflow_steps(run_id);
      PRAGMA user_version = 1;
    `);

    // Run migrations
    this.runMigrations();

    // Setup periodic WAL checkpoint to prevent unbounded growth (every 10 minutes)
    this._setupWALCheckpoint();
  }

  /**
   * Setup periodic WAL checkpoint to prevent unbounded WAL file growth.
   * 
   * MEMORY/DISK OPTIMIZATION: SQLite WAL mode can grow WAL files to GB+ sizes
   * without periodic checkpoints. This truncates the WAL after syncing to main DB.
   */
  _setupWALCheckpoint() {
    // Immediate checkpoint on init
    this._checkpointWAL();

    // Periodic checkpoint every 10 minutes
    this._walCheckpointInterval = setInterval(() => {
      this._checkpointWAL();
    }, 10 * 60 * 1000); // 10 minutes
  }

  _checkpointWAL() {
    try {
      if (isBun) {
        this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      } else {
        this.db.pragma('wal_checkpoint(TRUNCATE)');
      }
    } catch (e) {
      console.error('[WorkflowStore] WAL checkpoint failed:', e.message);
    }
  }

  runMigrations() {
    // Get current schema version
    let currentVersion;
    try {
      if (isBun) {
        currentVersion = this.db.query('PRAGMA user_version').get()['user_version'];
      } else {
        currentVersion = this.db.pragma('user_version', { simple: true });
      }
    } catch (e) {
      currentVersion = 0;
    }

    if (currentVersion < 2) {
      const migrationPath = join(__dirname, 'schema', 'migrations', '002-api-usage.sql');
      if (existsSync(migrationPath)) {
        const migrationSql = readFileSync(migrationPath, 'utf8');
        this.db.exec(migrationSql);
        console.log('[WorkflowStore] Applied migration 002: API Usage Tracking');
      }
    }
  }

  createRun(name, input, id = null) {
    if (!id) id = uuidv4();
    this.db.prepare(`
      INSERT OR IGNORE INTO workflow_runs (id, name, status, input)
      VALUES (?, ?, 'running', ?)
    `).run(id, name, JSON.stringify(input));
    
    this.logEvent(id, 'workflow_started', { name, input });
    return id;
  }

  updateRunStatus(id, status) {
    this.db.prepare('UPDATE workflow_runs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(status, id);
    this.logEvent(id, `workflow_${status}`, {});
  }

  updateRunContext(id, context) {
    this.db.prepare('UPDATE workflow_runs SET context = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(JSON.stringify(context), id);
  }

  upsertStep(runId, stepId, status, result = null, attempts = 0) {
    this.db.prepare(`
      INSERT INTO workflow_steps (run_id, step_id, status, result, attempts)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(run_id, step_id) DO UPDATE SET
        status = excluded.status,
        result = excluded.result,
        attempts = excluded.attempts,
        updated_at = CURRENT_TIMESTAMP
    `).run(runId, stepId, status, result ? JSON.stringify(result) : null, attempts);
  }

  getRunState(id) {
    const run = this.db.prepare('SELECT * FROM workflow_runs WHERE id = ?').get(id);
    if (!run) return null;
    
    const steps = this.db.prepare('SELECT * FROM workflow_steps WHERE run_id = ?').all(id);
    return {
      ...run,
      input: JSON.parse(run.input),
      context: JSON.parse(run.context),
      steps: steps.map(s => ({
        ...s,
        result: s.result ? JSON.parse(s.result) : null
      }))
    };
  }

  logEvent(runId, type, payload) {
    this.db.prepare('INSERT INTO audit_events (run_id, type, payload) VALUES (?, ?, ?)')
      .run(runId, type, JSON.stringify(payload));
  }

  close() {
    // Clear WAL checkpoint interval before closing
    if (this._walCheckpointInterval) {
      clearInterval(this._walCheckpointInterval);
    }
    
    // Final checkpoint before close
    this._checkpointWAL();
    
    this.db.close();
  }
}

module.exports = { WorkflowStore };
