import sqlite3 from 'better-sqlite3';

export interface WorkflowRun {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'failed';
  input: any;
  context: any;
  created_at: string;
  updated_at: string;
}

export interface WorkflowStep {
  run_id: string;
  step_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result: any;
  attempts: number;
  updated_at: string;
}

export interface AuditEvent {
  id: number;
  run_id: string;
  type: string;
  payload: any;
  timestamp: string;
}

export interface DataSource {
  getRuns(): Promise<WorkflowRun[]>;
  getRun(id: string): Promise<WorkflowRun | null>;
  getSteps(runId: string): Promise<WorkflowStep[]>;
  getEvents(runId: string): Promise<AuditEvent[]>;
}
