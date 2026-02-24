'use client';

import { useEffect, useState } from 'react';

type MetaOverview = {
  composite?: { score_mean: number; score_ci_low: number; score_ci_high: number; sample_count: number };
  domains?: Record<string, { score_mean: number; score_ci_low: number; score_ci_high: number; sample_count: number; latest_reasons?: string[] }>;
  rl_signal?: { accepted: boolean; confidence: number; max_influence: number; confidence_threshold: number };
};

type Stability = {
  bounded_update_count: number;
  anomaly_count: number;
  confidence_gate: { accepted: number; rejected: number; acceptance_rate: number };
};

type Correlation = {
  totals?: { events: number; models: number; skills: number; tools: number; outcomes: number };
  distributions?: { model: Record<string, number>; skill: Record<string, number>; tool: Record<string, number>; outcome: Record<string, number> };
};

export default function OrchestrationIntelligencePage() {
  const [overview, setOverview] = useState<MetaOverview | null>(null);
  const [stability, setStability] = useState<Stability | null>(null);
  const [correlation, setCorrelation] = useState<Correlation | null>(null);
  const [forensics, setForensics] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [overviewRes, stabilityRes, correlationRes, forensicsRes] = await Promise.all([
          fetch('/api/orchestration/meta-awareness', { cache: 'no-store' }),
          fetch('/api/orchestration/stability', { cache: 'no-store' }),
          fetch('/api/orchestration/correlation?sinceDays=30', { cache: 'no-store' }),
          fetch('/api/orchestration/forensics?limit=50', { cache: 'no-store' }),
        ]);

        if (!overviewRes.ok || !stabilityRes.ok || !correlationRes.ok || !forensicsRes.ok) {
          throw new Error('Failed to load orchestration intelligence data');
        }

        const [overviewJson, stabilityJson, correlationJson, forensicsJson] = await Promise.all([
          overviewRes.json(),
          stabilityRes.json(),
          correlationRes.json(),
          forensicsRes.json(),
        ]);

        if (cancelled) return;
        setOverview(overviewJson);
        setStability(stabilityJson);
        setCorrelation(correlationJson);
        setForensics(Array.isArray(forensicsJson?.events) ? forensicsJson.events : []);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Unknown error');
      }
    };

    void load();
    const interval = window.setInterval(() => void load(), 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const domainEntries = Object.entries(overview?.domains || {});

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl p-6">
        <header className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <h1 className="text-3xl font-bold text-cyan-300">Orchestration Intelligence</h1>
          <p className="mt-1 text-sm text-zinc-400">Meta-awareness, stability guardrails, and cross-domain orchestration insights.</p>
          {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
        </header>

        <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="text-xs text-zinc-500">Composite Score</div>
            <div className="font-mono text-2xl text-cyan-300">{overview?.composite?.score_mean?.toFixed(2) ?? '50.00'}</div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="text-xs text-zinc-500">Confidence</div>
            <div className="font-mono text-2xl">{((overview?.rl_signal?.confidence || 0) * 100).toFixed(1)}%</div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="text-xs text-zinc-500">RL Signal</div>
            <div className={`font-semibold ${overview?.rl_signal?.accepted ? 'text-emerald-300' : 'text-amber-300'}`}>
              {overview?.rl_signal?.accepted ? 'Accepted' : 'Rejected'}
            </div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="text-xs text-zinc-500">Observed Events</div>
            <div className="font-mono text-2xl">{correlation?.totals?.events ?? 0}</div>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-300">Domain Scores</h2>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {domainEntries.length === 0 ? <div className="text-sm text-zinc-500">No domain data yet.</div> : null}
            {domainEntries.map(([domain, data]) => (
              <div key={domain} className="rounded border border-zinc-800 bg-zinc-900/60 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-zinc-200">{domain}</div>
                  <div className="font-mono text-sm">{data.score_mean.toFixed(2)}</div>
                </div>
                <div className="mt-1 text-xs text-zinc-500">CI [{data.score_ci_low.toFixed(2)}, {data.score_ci_high.toFixed(2)}] · samples {data.sample_count}</div>
                {(data.latest_reasons || []).length > 0 ? <div className="mt-2 text-xs text-zinc-400">Latest: {(data.latest_reasons || []).join(' | ')}</div> : null}
              </div>
            ))}
          </div>
        </section>

        <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-300">Learning Stability</h2>
            <div className="space-y-2 text-sm">
              <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3">Bounded updates: <span className="font-mono">{stability?.bounded_update_count ?? 0}</span></div>
              <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3">Anomalies: <span className="font-mono">{stability?.anomaly_count ?? 0}</span></div>
              <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3">Gate acceptance: <span className="font-mono">{((stability?.confidence_gate?.acceptance_rate || 0) * 100).toFixed(1)}%</span></div>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-300">Correlation Totals (30d)</h2>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3">Models: <span className="font-mono">{correlation?.totals?.models ?? 0}</span></div>
              <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3">Skills: <span className="font-mono">{correlation?.totals?.skills ?? 0}</span></div>
              <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3">Tools: <span className="font-mono">{correlation?.totals?.tools ?? 0}</span></div>
              <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3">Outcomes: <span className="font-mono">{correlation?.totals?.outcomes ?? 0}</span></div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-300">Forensics (Recent Events)</h2>
          <div className="space-y-2 text-xs">
            {forensics.length === 0 ? <div className="text-zinc-500">No forensic events yet.</div> : null}
            {forensics.map((event, index) => (
              <div key={`${event.timestamp || 'evt'}-${index}`} className="rounded border border-zinc-800 bg-zinc-900/60 p-2">
                <div className="text-zinc-300">{event.event_type || 'unknown'} · {event.session_id || 'unknown session'}</div>
                <div className="text-zinc-500">{event.timestamp || 'unknown time'}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
