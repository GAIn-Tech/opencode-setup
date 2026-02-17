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
  // Connection pool for better performance
  static #connectionPool = new Map();
  static #poolSize = 5;
  
  constructor(dbPath) {
    if (!dbPath) {
      const configDir = join(process.env.HOME || process.env.USERPROFILE, '.opencode');
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }
      dbPath = join(configDir, 'sisyphus-state.db');
    }

    // Use connection from pool or create new one
    if (WorkflowStore.#connectionPool.has(dbPath)) {
      const pool = WorkflowStore.#connectionPool.get(dbPath);
      if (pool.available < pool.connections.length) {
        this.db = pool.connections[pool.available++];
        this.dbPath = dbPath;
        this.isPooled = true;
        return;
      }
    }

    this.db = new Database(dbPath);
    if (isBun) {
      this.db.exec('PRAGMA journal_mode = WAL');
      this.db.exec('PRAGMA busy_timeout = 5000');
      this.db.exec('PRAGMA query_only = OFF');
    } else {
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('busy_timeout = 5000');
    }
    this.dbPath = dbPath;
    this.isPooled = false;
    
    // Initialize connection pool for this path
    if (!WorkflowStore.#connectionPool.has(dbPath)) {
      WorkflowStore.#connectionPool.set(dbPath, {
        connections: [this.db],
        available: 1,
        maxSize: WorkflowStore.#poolSize
      });
    }
    
    this.init();
  }

  // Release connection back to pool
  release() {
    if (this.isPooled && this.dbPath) {
      const pool = WorkflowStore.#connectionPool.get(this.dbPath);
      if (pool && pool.available > 0) {
        pool.available--;
      }
    }
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

  /**
   * Close the database connection and cleanup resources.
   * FIX: Memory leak - clear WAL checkpoint interval on close
   * FIX: Added try-catch to prevent crashes during cleanup
   */
  close() {
    try {
      // Clear WAL checkpoint interval to prevent memory leak
      if (this._walCheckpointInterval) {
        clearInterval(this._walCheckpointInterval);
        this._walCheckpointInterval = null;
      }
      
      // Final checkpoint before close
      this._checkpointWAL();
      
      // Close database
      if (this.db) {
        this.db.close();
      }
      console.log('[WorkflowStore] Database closed safely');
    } catch (e) {
      console.error('[WorkflowStore] Close error:', e.message);
      // Force exit anyway to prevent hanging
      process.exit(1);
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

  /**
   * Execute multiple operations in a transaction.
   * Ensures atomicity - all succeed or all fail.
   * 
   * @param {Function} callback - Function receiving db object to perform operations
   * @returns {any} - Result from callback
   * @throws {Error} - Re-throws error with transaction context
   */
  /**
   * Sync audit events to knowledge graph.
   * Creates nodes in MemoryGraph for each error/pattern.
   */
  async syncToGraph(memoryGraph) {
    if (!memoryGraph || !memoryGraph.isActivated) {
      console.warn('[WorkflowStore] MemoryGraph not available for sync');
      return;
    }

    const events = this.db.prepare(`
      SELECT * FROM audit_events 
      WHERE created_at > datetime('now', '-7 days')
      ORDER BY created_at DESC
      LIMIT 100
    `).all();

    for (const event of events) {
      try {
        const payload = JSON.parse(event.payload || '{}');
        
        // Extract error patterns and add to graph
        if (event.event_type.includes('error') || event.event_type.includes('fail')) {
          await memoryGraph.addErrorNode({
            sessionId: payload.session_id || event.run_id,
            errorType: event.event_type,
            model: payload.model,
            provider: payload.provider,
            metadata: payload
          });
        }
      } catch (e) {
        console.error('[WorkflowStore] Failed to sync event to graph:', e.message);
      }
    }
    
    console.log(`[WorkflowStore] Synced ${events.length} events to knowledge graph`);
  }

  transaction(callback) {
    const isBunRuntime = typeof Bun !== 'undefined';
    
    if (isBunRuntime) {
      // Bun:sqlite transaction
      return this.db.transaction(callback)();
    } else {
      // better-sqlite3 transaction
      return this.db.transaction(callback)();
    }
  }

  /**
   * Execute operations in a savepoint (nested transaction).
   * Use for complex operations that can partially fail.
   * 
   * @param {string} savepointName - Name for the savepoint
   * @param {Function} callback - Function to execute within savepoint
   */
  savepoint(savepointName, callback) {
    const savepointSql = `SAVEPOINT ${savepointName}`;
    const releaseSql = `RELEASE SAVEPOINT ${savepointName}`;
    const rollbackSql = `ROLLBACK TO SAVEPOINT ${savepointName}`;
    
    try {
      this.db.exec(savepointSql);
      const result = callback();
      this.db.exec(releaseSql);
      return result;
    } catch (error) {
      this.db.exec(rollbackSql);
      throw error;
    }
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
