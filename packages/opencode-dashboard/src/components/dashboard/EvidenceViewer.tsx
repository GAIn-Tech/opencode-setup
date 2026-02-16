'use client';

import React from 'react';

export interface WorkflowRunDetail {
  id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
  input?: unknown;
  context?: unknown;
}

export interface AuditEventItem {
  id: number;
  type: string;
  payload: unknown;
  timestamp: string;
}

interface EvidenceViewerProps {
  run?: WorkflowRunDetail | null;
  events?: AuditEventItem[];
  selectedStepId?: string | null;
}

function eventTone(type: string): string {
  const lower = type.toLowerCase();
  if (lower.includes('fail') || lower.includes('error')) return 'border-red-500/30 bg-red-500/10';
  if (lower.includes('complete') || lower.includes('success')) return 'border-emerald-500/30 bg-emerald-500/10';
  if (lower.includes('start') || lower.includes('running')) return 'border-blue-500/30 bg-blue-500/10';
  return 'border-zinc-700 bg-zinc-900/60';
}

function actorFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'system';
  const data = payload as Record<string, unknown>;
  const actor = data.actor || data.agent || data.subagent || data.step_id || data.stepId;
  if (typeof actor !== 'string') return 'system';
  return actor;
}

function eventMatchesStep(event: AuditEventItem, selectedStepId: string | null): boolean {
  if (!selectedStepId) return true;
  if (!event.payload || typeof event.payload !== 'object') return false;
  const data = event.payload as Record<string, unknown>;
  const step = data.step_id || data.stepId || data.actor || data.subagent;
  return step === selectedStepId;
}

function pretty(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export const EvidenceViewer: React.FC<EvidenceViewerProps> = ({ run, events = [], selectedStepId = null }) => {
  const filteredEvents = events.filter((event) => eventMatchesStep(event, selectedStepId));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-100">Workflow Evidence</h2>
          {run ? <span className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300">{run.status}</span> : null}
        </div>

        {!run ? (
          <p className="text-sm italic text-zinc-500">Select a workflow session to inspect thread evidence.</p>
        ) : (
          <div className="space-y-2 text-xs text-zinc-300">
            <div><span className="text-zinc-500">Run:</span> <span className="font-mono">{run.id}</span></div>
            <div><span className="text-zinc-500">Name:</span> {run.name}</div>
            <div><span className="text-zinc-500">Created:</span> {new Date(run.created_at).toLocaleString()}</div>
            <div><span className="text-zinc-500">Updated:</span> {new Date(run.updated_at).toLocaleString()}</div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-100">Live Thread Timeline</h3>
          <span className="text-xs text-zinc-500">{filteredEvents.length} events</span>
        </div>

        {filteredEvents.length === 0 ? (
          <p className="text-sm italic text-zinc-500">No events for this thread yet.</p>
        ) : (
          <div className="max-h-[640px] space-y-2 overflow-auto pr-1">
            {filteredEvents.map((event) => (
              <article key={event.id} className={`rounded-lg border p-3 ${eventTone(event.type)}`}>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-300">
                      {actorFromPayload(event.payload)}
                    </span>
                    <span className="text-xs font-medium text-zinc-100">{event.type}</span>
                  </div>
                  <time className="text-[11px] text-zinc-500" dateTime={event.timestamp}>
                    {new Date(event.timestamp).toLocaleString()}
                  </time>
                </div>

                <pre className="whitespace-pre-wrap break-words rounded border border-zinc-700 bg-zinc-950/70 p-2 text-[11px] leading-relaxed text-zinc-200">
                  {pretty(event.payload)}
                </pre>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
