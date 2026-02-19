'use client';

import React from 'react';

export interface WorkflowRunItem {
  id: string;
  name: string;
  status: string;
  updated_at: string;
  created_at: string;
  session_tokens?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

export interface WorkflowStepItem {
  step_id: string;
  status: string;
  updated_at: string;
}

interface WorkflowTreeProps {
  runs?: WorkflowRunItem[];
  selectedRunId?: string | null;
  onSelectRun?: (runId: string) => void;
  steps?: WorkflowStepItem[];
  selectedStepId?: string | null;
  onSelectStep?: (stepId: string | null) => void;
}

function statusBadge(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'failed':
      return 'bg-red-500/15 text-red-300 border-red-500/30';
    case 'running':
      return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
    default:
      return 'bg-zinc-700/40 text-zinc-300 border-zinc-600/50';
  }
}

export const WorkflowTree: React.FC<WorkflowTreeProps> = ({
  runs = [],
  selectedRunId = null,
  onSelectRun,
  steps = [],
  selectedStepId = null,
  onSelectStep,
}) => {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">Workflow Sessions</h2>
          <span className="text-xs text-zinc-500">{runs.length}</span>
        </div>

        {runs.length === 0 ? (
          <p className="text-sm italic text-zinc-500">No workflow sessions found.</p>
        ) : (
          <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
            {runs.map((run) => {
              const active = run.id === selectedRunId;
              return (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => onSelectRun?.(run.id)}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    active
                      ? 'border-emerald-500/40 bg-emerald-500/10'
                      : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700 hover:bg-zinc-900/70'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-medium text-zinc-100">{run.name || run.id}</div>
                    <span className={`rounded border px-2 py-0.5 text-xs ${statusBadge(run.status)}`}>
                      {run.status}
                    </span>
                  </div>
                  <div className="truncate text-xs font-mono text-zinc-500">{run.id}</div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[11px] text-zinc-500">Updated {new Date(run.updated_at).toLocaleString()}</span>
                    {run.session_tokens && run.session_tokens.total_tokens > 0 && (
                      <span className="text-[11px] font-mono text-emerald-400">
                        {run.session_tokens.total_tokens.toLocaleString()} tokens
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-100">Run Thread</h3>
          <button
            type="button"
            onClick={() => onSelectStep?.(null)}
            className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            all
          </button>
        </div>

        {!selectedRunId ? (
          <p className="text-sm italic text-zinc-500">Select a session to inspect its agent/subagent thread.</p>
        ) : steps.length === 0 ? (
          <p className="text-sm italic text-zinc-500">No steps recorded for this run yet.</p>
        ) : (
          <div className="max-h-[320px] space-y-2 overflow-auto pr-1">
            {steps.map((step) => {
              const active = step.step_id === selectedStepId;
              const isSubagent = step.step_id.toLowerCase().includes('subagent') || step.step_id.includes('bg_');
              return (
                <button
                  key={step.step_id}
                  type="button"
                  onClick={() => onSelectStep?.(step.step_id)}
                  className={`w-full rounded-lg border p-2.5 text-left transition ${
                    active
                      ? 'border-cyan-500/40 bg-cyan-500/10'
                      : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700 hover:bg-zinc-900/70'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-mono text-zinc-200">{step.step_id}</span>
                    <span className={`rounded border px-2 py-0.5 text-[10px] ${statusBadge(step.status)}`}>{step.status}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <span>{isSubagent ? 'Subagent thread' : 'Main agent thread'}</span>
                    <span>{new Date(step.updated_at).toLocaleTimeString()}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
