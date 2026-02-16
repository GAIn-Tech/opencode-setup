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

  const loadRuns = useCallback(async () => {
    try {
      const response = await fetch('/api/runs', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Failed to load runs (${response.status})`);
      const data = (await response.json()) as WorkflowRun[];
      setRuns(data);

      setSelectedRunId((prev) => {
        if (prev && data.some((run) => run.id === prev)) return prev;
        return data[0]?.id ?? null;
      });
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
      setSteps([]);
      setEvents([]);
      setActiveRun(null);
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
    const interval = setInterval(() => {
      void loadRunDetails(selectedRunId);
    }, 2500);

    return () => clearInterval(interval);
  }, [selectedRunId, loadRunDetails]);

  useRealTimeUpdates({
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

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-200">
      <div className="p-6 max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-emerald-400 mb-2">Workflow Monitor</h1>
          <p className="text-zinc-400">Monitor historical sessions and live main-agent/subagent thread evidence.</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            <span>{sortedRuns.length} sessions</span>
            <span>{steps.length} steps</span>
            <span>{events.length} events</span>
            {loading ? <span className="text-emerald-400">syncing...</span> : null}
          </div>
          {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <WorkflowTree
              runs={sortedRuns}
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
            <EvidenceViewer run={activeRun} events={events} selectedStepId={selectedStepId} />
          </div>
        </div>
      </div>
    </main>
  );
}
