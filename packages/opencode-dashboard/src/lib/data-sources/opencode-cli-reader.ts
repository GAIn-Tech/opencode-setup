import { spawnSync } from 'node:child_process';
import type { AuditEvent, DataSource, WorkflowRun, WorkflowStep } from './types';

type SessionListItem = {
  id: string;
  title?: string;
  updated?: number;
  created?: number;
  projectId?: string;
  directory?: string;
};

type ExportMessage = {
  info?: {
    id?: string;
    role?: string;
    time?: { created?: number; completed?: number };
    agent?: string;
  };
  parts?: Array<{ type?: string; text?: string; [key: string]: unknown }>;
};

type ExportSession = {
  info?: {
    id?: string;
    title?: string;
    directory?: string;
    projectID?: string;
    time?: { created?: number; updated?: number };
  };
  messages?: ExportMessage[];
};

function runOpencode(args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync('opencode', args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  return {
    ok: result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function parseJsonFromOutput(text: string): any {
  const start = text.indexOf('{');
  const listStart = text.indexOf('[');

  if (listStart >= 0 && (start === -1 || listStart < start)) {
    return JSON.parse(text.slice(listStart));
  }

  if (start >= 0) {
    return JSON.parse(text.slice(start));
  }

  return JSON.parse(text);
}

function toIso(ms?: number): string {
  return ms ? new Date(ms).toISOString() : new Date(0).toISOString();
}

export class OpencodeCliReader implements DataSource {
  async getRuns(): Promise<WorkflowRun[]> {
    const result = runOpencode(['session', 'list', '--format', 'json', '-n', '200']);
    if (!result.ok) {
      console.warn(`[OpencodeCliReader] session list failed: ${result.stderr}`);
      return [];
    }

    try {
      const sessions = parseJsonFromOutput(result.stdout) as SessionListItem[];
      return sessions.map((s) => ({
        id: s.id,
        name: s.title || s.id,
        status: 'completed',
        input: { directory: s.directory, projectId: s.projectId },
        context: {},
        created_at: toIso(s.created),
        updated_at: toIso(s.updated),
      }));
    } catch (err) {
      console.warn(`[OpencodeCliReader] failed to parse session list: ${String(err)}`);
      return [];
    }
  }

  async getRun(id: string): Promise<WorkflowRun | null> {
    const runs = await this.getRuns();
    return runs.find((r) => r.id === id) || null;
  }

  async getSteps(runId: string): Promise<WorkflowStep[]> {
    const exported = await this.exportSession(runId);
    if (!exported) return [];

    const messages = exported.messages || [];
    const assistantMessages = messages.filter((msg) => (msg.info?.role || '').toLowerCase() === 'assistant');

    return assistantMessages.map((msg, idx) => {
      const created = msg.info?.time?.created;
      const completed = msg.info?.time?.completed;
      const stepId = msg.info?.id || `${msg.info?.agent || 'agent'}-${idx + 1}`;
      const result = (msg.parts || []).map((p) => ({ type: p.type, text: p.text ?? '' }));

      return {
        run_id: runId,
        step_id: stepId,
        status: completed ? 'completed' : 'running',
        result,
        attempts: 1,
        updated_at: toIso(completed || created),
      };
    });
  }

  async getEvents(runId: string): Promise<AuditEvent[]> {
    const exported = await this.exportSession(runId);
    if (!exported) return [];

    const messages = exported.messages || [];
    const events: AuditEvent[] = [];
    let counter = 1;

    for (const msg of messages) {
      const role = msg.info?.role || 'unknown';
      const actor = msg.info?.agent || role;
      const timestamp = toIso(msg.info?.time?.created);
      const messageId = msg.info?.id || `msg-${counter}`;

      if (!msg.parts || msg.parts.length === 0) {
        events.push({
          id: counter++,
          run_id: runId,
          type: `${role}.message`,
          payload: { actor, message_id: messageId },
          timestamp,
        });
        continue;
      }

      for (const part of msg.parts) {
        events.push({
          id: counter++,
          run_id: runId,
          type: `${role}.${part.type || 'part'}`,
          payload: {
            actor,
            message_id: messageId,
            part_type: part.type,
            text: part.text,
            data: part,
          },
          timestamp,
        });
      }
    }

    return events;
  }

  private async exportSession(runId: string): Promise<ExportSession | null> {
    const result = runOpencode(['export', runId]);
    if (!result.ok) {
      console.warn(`[OpencodeCliReader] export failed for ${runId}: ${result.stderr}`);
      return null;
    }

    try {
      return parseJsonFromOutput(result.stdout) as ExportSession;
    } catch (err) {
      console.warn(`[OpencodeCliReader] export parse failed for ${runId}: ${String(err)}`);
      return null;
    }
  }
}
