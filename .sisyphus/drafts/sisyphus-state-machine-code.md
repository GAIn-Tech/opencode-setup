# Code Draft: opencode-sisyphus-state

This draft contains the proposed implementation for the `opencode-sisyphus-state` package. Sisyphus should use these snippets as a starting point during implementation.

## src/database.js
```javascript
const Database = require('better-sqlite3');
const { join } = require('path');
const { existsSync, mkdirSync } = require('fs');

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
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.init();
  }

  init() {
    this.db.exec(`
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
    `);
  }

  createRun(id, name, input) {
    this.db.prepare(`
      INSERT INTO workflow_runs (id, name, status, input)
      VALUES (?, ?, 'running', ?)
    `).run(id, name, JSON.stringify(input));
    
    this.logEvent(id, 'workflow_started', { name, input });
  }

  updateRunStatus(id, status) {
    this.db.prepare('UPDATE workflow_runs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(status, id);
    this.logEvent(id, `workflow_${status}`, {});
  }

  upsertStep(runId, stepId, status, result = null) {
    this.db.prepare(`
      INSERT INTO workflow_steps (run_id, step_id, status, result)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(run_id, step_id) DO UPDATE SET
        status = excluded.status,
        result = excluded.result,
        updated_at = CURRENT_TIMESTAMP
    `).run(runId, stepId, status, result ? JSON.stringify(result) : null);
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
}

module.exports = { WorkflowStore };
```

## src/executor.js
```javascript
const { v4: uuidv4 } = require('uuid');

class WorkflowExecutor {
  constructor(store, handlers = {}) {
    this.store = store;
    this.handlers = handlers;
  }

  async execute(workflowDef, input) {
    const runId = uuidv4();
    this.store.createRun(runId, workflowDef.name, input);

    try {
      const context = { ...input };
      
      for (const step of workflowDef.steps) {
        await this.executeStepWithCheckpoint(runId, step, context);
      }

      this.store.updateRunStatus(runId, 'completed');
      return { runId, status: 'completed', context };
    } catch (err) {
      this.store.updateRunStatus(runId, 'failed');
      throw err;
    }
  }

  async executeStepWithCheckpoint(runId, step, context) {
    const state = this.store.getRunState(runId);
    const stepState = state.steps.find(s => s.step_id === step.id);
    
    if (stepState?.status === 'completed') {
      Object.assign(context, stepState.result);
      return;
    }

    this.store.upsertStep(runId, step.id, 'running');
    this.store.logEvent(runId, 'step_started', { stepId: step.id });

    try {
      const handler = this.handlers[step.type];
      const result = await handler(step, context);
      
      this.store.db.transaction(() => {
        this.store.upsertStep(runId, step.id, 'completed', result);
        this.store.logEvent(runId, 'step_completed', { stepId: step.id, result });
      })();

      Object.assign(context, result);
    } catch (err) {
      this.store.upsertStep(runId, step.id, 'failed', { error: err.message });
      this.store.logEvent(runId, 'step_failed', { stepId: step.id, error: err.message });
      throw err;
    }
  }

  async resume(runId, workflowDef) {
    const state = this.store.getRunState(runId);
    if (!state) throw new Error(`Run not found: ${runId}`);
    if (state.status === 'completed') return { runId, status: 'completed', context: state.context };

    this.store.updateRunStatus(runId, 'running');
    const context = { ...state.input, ...state.context };

    for (const step of workflowDef.steps) {
      await this.executeStepWithCheckpoint(runId, step, context);
    }

    this.store.updateRunStatus(runId, 'completed');
    return { runId, status: 'completed', context };
  }
}

module.exports = { WorkflowExecutor };
```
