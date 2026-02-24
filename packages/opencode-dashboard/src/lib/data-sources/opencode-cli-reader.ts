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

type CachedTitle = {
  value: string;
  expiresAt: number;
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

const TITLE_CACHE_TTL_MS = 10 * 60 * 1000;
const titleCache = new Map<string, CachedTitle>();

function runOpencode(args: string[], timeoutMs = 20000): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync('opencode', args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: timeoutMs,
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

function cleanTitle(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function isGenericSessionTitle(title: string | undefined, id: string): boolean {
  if (!title) return true;
  const normalized = cleanTitle(title);
  if (!normalized) return true;
  if (normalized === id) return true;
  if (/^new session\s*-?/i.test(normalized)) return true;
  if (/^conversation title\s*:/i.test(normalized)) return true;
  if (/^session\s+[0-9]+$/i.test(normalized)) return true;
  return false;
}

function previewFromMessages(messages?: ExportMessage[]): string | null {
  if (!Array.isArray(messages)) return null;
  for (const msg of messages) {
    const role = String(msg?.info?.role || '').toLowerCase();
    if (role !== 'user') continue;
    const textPart = (msg.parts || []).find((part) => typeof part?.text === 'string' && part.text.trim().length > 0);
    if (!textPart || typeof textPart.text !== 'string') continue;
    const trimmed = cleanTitle(textPart.text);
    if (!trimmed) continue;
    return trimmed.length > 72 ? `${trimmed.slice(0, 72)}...` : trimmed;
  }
  return null;
}

function timestampLabel(ms?: number): string {
  if (!ms) return 'Untitled Session';
  return `Session ${new Date(ms).toLocaleString()}`;
}

export class OpencodeCliReader implements DataSource {
  async getRuns(): Promise<WorkflowRun[]> {
    const result = runOpencode(['session', 'list', '--format', 'json', '-n', '1000']);
    if (!result.ok) {
      console.warn(`[OpencodeCliReader] session list failed: ${result.stderr}`);
      return [];
    }

    try {
      const sessions = parseJsonFromOutput(result.stdout) as SessionListItem[];
      const sorted = sessions
        .filter((s) => typeof s.id === 'string' && s.id.length > 0)
        .sort((a, b) => (b.updated || 0) - (a.updated || 0));

      const runs: WorkflowRun[] = [];
      const maxEnriched = Number.isFinite(Number(process.env.DASHBOARD_NAME_ENRICH_LIMIT))
        ? Number(process.env.DASHBOARD_NAME_ENRICH_LIMIT)
        : 20;

      for (let i = 0; i < sorted.length; i += 1) {
        const session = sorted[i];
        const name = await this.resolveSessionName(session, i < maxEnriched);
        runs.push({
          id: session.id,
          name,
          status: 'completed',
          input: {
            directory: session.directory,
            projectId: session.projectId,
            data_source: 'opencode-cli',
          },
          context: {},
          created_at: toIso(session.created),
          updated_at: toIso(session.updated),
        });
      }

      return runs;
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
    const result = runOpencode(['export', runId], 2000);
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

  private async resolveSessionName(session: SessionListItem, allowEnrichment: boolean): Promise<string> {
    const baseTitle = cleanTitle(session.title || '');
    const id = session.id;

    if (!isGenericSessionTitle(baseTitle, id)) {
      return baseTitle;
    }

    const cached = titleCache.get(id);
    if (cached && cached.expiresAt > Date.now() && !cached.value.startsWith('Session: ')) {
      return cached.value;
    }

    let resolved = '';
    if (allowEnrichment) {
      const exported = await this.exportSession(id);
      if (exported?.info?.title && !isGenericSessionTitle(exported.info.title, id)) {
        resolved = cleanTitle(exported.info.title);
      }

      if (!resolved) {
        resolved = previewFromMessages(exported?.messages) || '';
      }
    }

    if (!resolved && session.directory) {
      const dir = cleanTitle(session.directory.split(/[\\/]/).filter(Boolean).slice(-1)[0] || '');
      if (dir) {
        const stamp = session.updated || session.created;
        resolved = stamp
          ? `Session: ${dir} (${new Date(stamp).toLocaleString()})`
          : `Session: ${dir}`;
      }
    }

    if (!resolved) {
      resolved = timestampLabel(session.updated || session.created);
    }

    titleCache.set(id, {
      value: resolved,
      expiresAt: Date.now() + TITLE_CACHE_TTL_MS,
    });

    return resolved;
  }
}
