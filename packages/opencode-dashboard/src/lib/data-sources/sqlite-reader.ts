import sqlite3 from 'better-sqlite3';
import { DataSource, WorkflowRun, WorkflowStep, AuditEvent } from './types';

export class SQLiteReader implements DataSource {
  private db: any;

  constructor(dbPath: string) {
    this.db = new sqlite3(dbPath, { readonly: true });
  }

  async getRuns(): Promise<WorkflowRun[]> {
    const rows = this.db.prepare('SELECT * FROM workflow_runs ORDER BY created_at DESC').all();
    return rows.map((row: any) => ({
      ...row,
      input: JSON.parse(row.input),
      context: JSON.parse(row.context)
    }));
  }

  async getRun(id: string): Promise<WorkflowRun | null> {
    const row = this.db.prepare('SELECT * FROM workflow_runs WHERE id = ?').get(id);
    if (!row) return null;
    return {
      ...row,
      input: JSON.parse(row.input),
      context: JSON.parse(row.context)
    };
  }

  async getSteps(runId: string): Promise<WorkflowStep[]> {
    const rows = this.db.prepare('SELECT * FROM workflow_steps WHERE run_id = ?').all(runId);
    return rows.map((row: any) => ({
      ...row,
      result: row.result ? JSON.parse(row.result) : null
    }));
  }

  async getEvents(runId: string): Promise<AuditEvent[]> {
    const rows = this.db.prepare('SELECT * FROM audit_events WHERE run_id = ? ORDER BY timestamp ASC').all(runId);
    return rows.map((row: any) => ({
      ...row,
      payload: JSON.parse(row.payload)
    }));
  }
}
