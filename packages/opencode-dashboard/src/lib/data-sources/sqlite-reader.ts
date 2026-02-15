import sqlite3 from 'better-sqlite3';
import { DataSource, WorkflowRun, WorkflowStep, AuditEvent } from './types';

/** Safely parse JSON with a fallback value instead of throwing */
function safeJsonParse<T>(str: string | null | undefined, fallback: T): T {
  if (str == null) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

export class SQLiteReader implements DataSource {
  private db: any;
  private available: boolean;

  constructor(dbPath: string) {
    try {
      this.db = new sqlite3(dbPath, { readonly: true });
      this.available = true;
    } catch (err: any) {
      console.warn(
        `[SQLiteReader] Could not open database at "${dbPath}": ${err.message}\n` +
        `  Dashboard will operate without workflow data. ` +
        `Ensure the database file exists or set SQLITE_DB_PATH to a valid path.`
      );
      this.db = null;
      this.available = false;
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  async getRuns(): Promise<WorkflowRun[]> {
    if (!this.db) return [];
    try {
      const rows = this.db.prepare('SELECT * FROM workflow_runs ORDER BY created_at DESC').all();
      return rows.map((row: any) => ({
        ...row,
        input: safeJsonParse(row.input, {}),
        context: safeJsonParse(row.context, {})
      }));
    } catch (err: any) {
      console.warn(`[SQLiteReader] getRuns failed: ${err.message}`);
      return [];
    }
  }

  async getRun(id: string): Promise<WorkflowRun | null> {
    if (!this.db) return null;
    try {
      const row = this.db.prepare('SELECT * FROM workflow_runs WHERE id = ?').get(id);
      if (!row) return null;
      return {
        ...row,
        input: safeJsonParse(row.input, {}),
        context: safeJsonParse(row.context, {})
      };
    } catch (err: any) {
      console.warn(`[SQLiteReader] getRun(${id}) failed: ${err.message}`);
      return null;
    }
  }

  async getSteps(runId: string): Promise<WorkflowStep[]> {
    if (!this.db) return [];
    try {
      const rows = this.db.prepare('SELECT * FROM workflow_steps WHERE run_id = ?').all(runId);
      return rows.map((row: any) => ({
        ...row,
        result: row.result ? safeJsonParse(row.result, null) : null
      }));
    } catch (err: any) {
      console.warn(`[SQLiteReader] getSteps(${runId}) failed: ${err.message}`);
      return [];
    }
  }

  async getEvents(runId: string): Promise<AuditEvent[]> {
    if (!this.db) return [];
    try {
      const rows = this.db.prepare('SELECT * FROM audit_events WHERE run_id = ? ORDER BY timestamp ASC').all(runId);
      return rows.map((row: any) => ({
        ...row,
        payload: safeJsonParse(row.payload, {})
      }));
    } catch (err: any) {
      console.warn(`[SQLiteReader] getEvents(${runId}) failed: ${err.message}`);
      return [];
    }
  }
}
