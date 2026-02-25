'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { WorkflowTree } from '@/components/dashboard/WorkflowTree';
import { EvidenceViewer } from '@/components/dashboard/EvidenceViewer';
import { useRealTimeUpdates } from '@/hooks/useRealTimeUpdates';

type WorkflowRun = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
  input?: unknown;
  context?: unknown;
  session_tokens?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
};

type WorkflowStep = {
  run_id: string;
  step_id: string;
  status: string;
  updated_at: string;
};

type AuditEvent = {
  id: number;
  run_id: string;
  type: string;
  payload: unknown;
  timestamp: string;
};

export default function Home() {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [activeRun, setActiveRun] = useState<WorkflowRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'completed' | 'failed'>('all');

  const loadRuns = useCallback(async () => {
    const fetchWithRetry = async (attempts = 2): Promise<Response> => {
      let lastError: unknown;
      for (let i = 0; i <= attempts; i += 1) {
        try {
          const response = await fetch('/api/runs', { cache: 'no-store' });
          if (!response.ok) {
            throw new Error(`Failed to load runs (${response.status})`);
          }
          return response;
        } catch (error) {
          lastError = error;
          if (i < attempts) {
            await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1)));
          }
        }
      }
      throw lastError instanceof Error ? lastError : new Error('Unknown error loading runs');
    };

    try {
      const response = await fetchWithRetry(2);
      const data = (await response.json()) as WorkflowRun[];
      setRuns((prev) => (data.length === 0 && prev.length > 0 ? prev : data));

      setSelectedRunId((prev) => {
        if (prev && data.some((run) => run.id === prev)) return prev;
        if (data.length > 0) return data[0].id;
        return prev;
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error loading runs');
    }
  }, []);

  const loadRunDetails = useCallback(async (runId: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/runs/${runId}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Failed to load run details (${response.status})`);
      const data = (await response.json()) as WorkflowRun & { steps: WorkflowStep[]; events: AuditEvent[] };

      setActiveRun(data);
      setSteps(data.steps || []);
      setEvents(data.events || []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error loading run details');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    if (!selectedRunId) {
      setSteps([]);
      setEvents([]);
      setActiveRun(null);
      return;
    }

    void loadRunDetails(selectedRunId);
  }, [selectedRunId, loadRunDetails]);

  const realtime = useRealTimeUpdates({
    onWorkflowUpdate: () => {
      void loadRuns();
      if (selectedRunId) void loadRunDetails(selectedRunId);
    },
    onSessionUpdate: () => {
      if (selectedRunId) void loadRunDetails(selectedRunId);
    },
  });

  const sortedRuns = useMemo(
    () => runs.slice().sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [runs]
  );

  const filteredRuns = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return sortedRuns.filter((run) => {
      if (statusFilter !== 'all' && run.status !== statusFilter) return false;
      if (!term) return true;
      return run.name?.toLowerCase().includes(term) || run.id.toLowerCase().includes(term);
    });
  }, [sortedRuns, searchTerm, statusFilter]);

  const runDuration = useMemo(() => {
    if (!activeRun) return null;
    const start = new Date(activeRun.created_at).getTime();
    const end = new Date(activeRun.updated_at).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    const seconds = Math.max(0, Math.floor((end - start) / 1000));
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}m ${remainder}s`;
  }, [activeRun]);

  const activeAgent = useMemo(() => {
    if (!activeRun?.context || typeof activeRun.context !== 'object') return null;
    const context = activeRun.context as Record<string, unknown>;
    return (context.agent as string) || (context.agent_name as string) || null;
  }, [activeRun]);

  const exportRunReport = useCallback(() => {
    if (!activeRun) return;
    const payload = {
      run: activeRun,
      steps,
      events,
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `workflow-${activeRun.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [activeRun, steps, events]);

  const timelineItems = useMemo(() => {
    return steps
      .slice()
      .sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());
  }, [steps]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-200">
      <div className="p-6 max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-emerald-400 mb-2">Workflow Monitor</h1>
          <p className="text-zinc-400">Monitor historical sessions and live main-agent/subagent thread evidence.</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            <span>{filteredRuns.length} sessions</span>
            <span>{steps.length} steps</span>
            <span>{events.length} events</span>
            {loading ? <span className="text-emerald-400">syncing...</span> : null}
            {realtime.isConnected ? (
              <span className="text-emerald-400">realtime</span>
            ) : (
              <span className="text-amber-400">reconnecting</span>
            )}
          </div>
          {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
        </header>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search runs by name or id"
            className="flex-1 min-w-[220px] rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
          >
            <option value="all">All statuses</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
          <button
            onClick={() => void loadRuns()}
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-500/20"
          >
            Refresh
          </button>
          <button
            onClick={exportRunReport}
            disabled={!activeRun}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            Export report
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <WorkflowTree
              runs={filteredRuns}
              selectedRunId={selectedRunId}
              onSelectRun={(runId) => {
                setSelectedRunId(runId);
                setSelectedStepId(null);
              }}
              steps={steps}
              selectedStepId={selectedStepId}
              onSelectStep={setSelectedStepId}
            />
          </div>
          <div className="lg:col-span-2">
            {activeRun ? (
              <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
                  <div className="text-xs text-zinc-500">Duration</div>
                  <div className="text-sm text-zinc-200">{runDuration || 'N/A'}</div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
                  <div className="text-xs text-zinc-500">Agent</div>
                  <div className="text-sm text-zinc-200">{activeAgent || 'Unknown'}</div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
                  <div className="text-xs text-zinc-500">Token cost</div>
                  <div className="text-sm text-zinc-200">
                    {activeRun.session_tokens?.total_tokens?.toLocaleString() || 'N/A'}
                  </div>
                </div>
              </div>
            ) : null}

            <EvidenceViewer run={activeRun} events={events} selectedStepId={selectedStepId} />

            {timelineItems.length > 0 ? (
              <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-zinc-200">Timeline</h2>
                  <span className="text-xs text-zinc-500">{timelineItems.length} steps</span>
                </div>
                <div className="mt-3 space-y-2">
                  {timelineItems.map((step) => (
                    <div
                      key={`${step.run_id}-${step.step_id}`}
                      className={`flex items-center justify-between rounded border px-3 py-2 text-xs ${
                        step.step_id === selectedStepId
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{step.step_id}</span>
                        <span className="text-zinc-500">{step.status}</span>
                      </div>
                      <span className="text-zinc-500">{step.updated_at}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
