'use client';

import { useEffect, useMemo, useState } from 'react';

type Dist = { name: string; count: number; share: number; tokens?: number; success_rate?: number };
type Signal = { key: string; label: string; value: number; target: number; level: 'healthy' | 'warning' | 'critical'; detail: string };

type OrchestrationResponse = {
  generated_at: string;
  window: { since_days: number; top_n: number };
  health: { score: number; level: 'healthy' | 'warning' | 'critical'; signals: Signal[] };
  coverage: {
    skill_universe_total: number;
    skills_used_unique: number;
    skill_coverage_ratio: number;
    tools_used_unique: number;
    models_used_unique: number;
    agents_used_unique: number;
    sessions_observed: number;
  };
  loops: {
    total_estimated_loops: number;
    sessions_with_loops: number;
    avg_loops_per_session: number;
    max_loops_single_session: number;
    termination_reasons: Dist[];
  };
  tokens: {
    input: number;
    output: number;
    total: number;
    observed_messages: number;
    observed_ratio: number;
    p50_per_message: number;
    p90_per_message: number;
    by_model: Dist[];
    by_skill: Dist[];
    by_tool: Dist[];
  };
  model_distribution: Dist[];
  skill_distribution: Dist[];
  tool_distribution: Dist[];
  pipeline: {
    rl_skills: { total: number; avg_success_rate: number };
    learning: { anti_patterns_total: number; positive_patterns_total: number };
  };
  automation: {
    delegated_session_ratio: number;
    delegated_messages: number;
    workflow_runs: { total: number; active: number; completed: number; failed: number };
  };
  traceability: { traces_with_ids_ratio: number; spans_with_parent_ratio: number; custom_events: number };
  data_quality: { sources: Record<string, boolean> };
  frontier: {
    autonomy_readiness_score: number;
    governance_score: number;
    plugin_runtime_score: number;
    observability_score: number;
    adaptation_score: number;
    closed_loop_score: number;
    capabilities: Record<string, boolean>;
  };
  integration: {
    plugin_inventory: { configured: number; discovered: number };
    fallback_alignment: {
      first_provider_project_config: string | null;
      first_provider_root_config: string | null;
      aligned: boolean;
    };
    gaps: Array<{
      id: string;
      severity: 'critical' | 'high' | 'medium';
      domain: 'governance' | 'plugins' | 'fallback' | 'telemetry' | 'learning-loop' | 'ci';
      title: string;
      detail: string;
      evidence: string;
      recommended_next_step: string;
    }>;
  };
};

function levelClass(level: 'healthy' | 'warning' | 'critical') {
  if (level === 'healthy') return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
  if (level === 'warning') return 'text-amber-300 border-amber-500/30 bg-amber-500/10';
  return 'text-rose-300 border-rose-500/30 bg-rose-500/10';
}

function fmt(value: number) {
  return Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

function TopTable({ title, rows }: { title: string; rows: Dist[] }) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-300">{title}</h3>
      <div className="space-y-2">
        {rows.length === 0 ? <div className="text-sm text-zinc-500">No data in current window.</div> : null}
        {rows.map((row) => (
          <div key={row.name} className="rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-zinc-200">{row.name}</span>
              <span className="font-mono text-zinc-400">{fmt(row.count)} ({fmt(row.share)}%)</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
              <span>{row.tokens !== undefined ? `${fmt(row.tokens)} tokens` : 'no token split'}</span>
              <span>{row.success_rate !== undefined ? `success ${fmt(row.success_rate * 100)}%` : ''}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function scoreClass(score: number) {
  if (score >= 85) return 'text-emerald-300';
  if (score >= 65) return 'text-amber-300';
  return 'text-rose-300';
}

function severityClass(level: 'critical' | 'high' | 'medium') {
  if (level === 'critical') return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
  if (level === 'high') return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  return 'border-zinc-700 bg-zinc-900/60 text-zinc-200';
}

export default function OrchestrationPage() {
  const [sinceDays, setSinceDays] = useState(30);
  const [topN, setTopN] = useState(10);
  const [data, setData] = useState<OrchestrationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const params = new URLSearchParams({ sinceDays: String(sinceDays), topN: String(topN) });
        const res = await fetch(`/api/orchestration?${params.toString()}`, { cache: 'no-store', signal: controller.signal });
        if (!res.ok) {
          throw new Error(`Failed to load orchestration intelligence (${res.status})`);
        }
        const json = (await res.json()) as OrchestrationResponse;
        setData(json);
        setError(null);
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : 'Unknown error');
      }
    };

    void load();
    const interval = window.setInterval(() => void load(), 15000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [sinceDays, topN]);

  const sourceBadges = useMemo(() => {
    const entries = Object.entries(data?.data_quality?.sources || {});
    return entries.map(([source, ok]) => ({ source, ok }));
  }, [data]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl p-6">
        <header className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-cyan-300">Orchestration Intelligence</h1>
              <p className="mt-1 text-sm text-zinc-400">Unified health for supermemory, KG, RL skills, learning, model routing, and loop behavior.</p>
            </div>
            <div className="flex items-end gap-3 text-sm">
              <label className="flex flex-col gap-1">
                <span className="text-zinc-500">Window (days)</span>
                <input type="number" value={sinceDays} min={1} max={365} onChange={(e) => setSinceDays(Math.max(1, Number(e.target.value || 1)))} className="w-28 rounded border border-zinc-700 bg-zinc-900 px-2 py-1" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-zinc-500">Top N</span>
                <input type="number" value={topN} min={5} max={30} onChange={(e) => setTopN(Math.max(5, Number(e.target.value || 5)))} className="w-24 rounded border border-zinc-700 bg-zinc-900 px-2 py-1" />
              </label>
            </div>
          </div>
          {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
        </header>

        {data ? (
          <>
            <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
              <div className={`rounded-lg border p-3 ${levelClass(data.health.level)}`}>
                <div className="text-xs uppercase tracking-wide">Health</div>
                <div className="font-mono text-2xl font-bold">{fmt(data.health.score)}</div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"><div className="text-xs text-zinc-500">Sessions</div><div className="font-mono text-xl">{fmt(data.coverage.sessions_observed)}</div></div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"><div className="text-xs text-zinc-500">Skill Coverage</div><div className="font-mono text-xl">{fmt(data.coverage.skill_coverage_ratio)}%</div></div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"><div className="text-xs text-zinc-500">Tokens</div><div className="font-mono text-xl">{fmt(data.tokens.total)}</div></div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"><div className="text-xs text-zinc-500">Loops</div><div className="font-mono text-xl">{fmt(data.loops.total_estimated_loops)}</div></div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"><div className="text-xs text-zinc-500">Delegations</div><div className="font-mono text-xl">{fmt(data.automation.delegated_messages)}</div></div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"><div className="text-xs text-zinc-500">Trace IDs</div><div className="font-mono text-xl">{fmt(data.traceability.traces_with_ids_ratio)}%</div></div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"><div className="text-xs text-zinc-500">Custom Events</div><div className="font-mono text-xl">{fmt(data.traceability.custom_events)}</div></div>
            </section>

            <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-300">Frontier Readiness</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3"><div className="text-zinc-500">Autonomy</div><div className={`font-mono ${scoreClass(data.frontier.autonomy_readiness_score)}`}>{fmt(data.frontier.autonomy_readiness_score)}</div></div>
                  <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3"><div className="text-zinc-500">Governance</div><div className={`font-mono ${scoreClass(data.frontier.governance_score)}`}>{fmt(data.frontier.governance_score)}</div></div>
                  <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3"><div className="text-zinc-500">Plugin Runtime</div><div className={`font-mono ${scoreClass(data.frontier.plugin_runtime_score)}`}>{fmt(data.frontier.plugin_runtime_score)}</div></div>
                  <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3"><div className="text-zinc-500">Observability</div><div className={`font-mono ${scoreClass(data.frontier.observability_score)}`}>{fmt(data.frontier.observability_score)}</div></div>
                  <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3"><div className="text-zinc-500">Adaptation</div><div className={`font-mono ${scoreClass(data.frontier.adaptation_score)}`}>{fmt(data.frontier.adaptation_score)}</div></div>
                  <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3"><div className="text-zinc-500">Closed Loop</div><div className={`font-mono ${scoreClass(data.frontier.closed_loop_score)}`}>{fmt(data.frontier.closed_loop_score)}</div></div>
                </div>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-300">Integration Integrity</h3>
                <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3"><div className="text-zinc-500">Plugins configured</div><div className="font-mono">{fmt(data.integration.plugin_inventory.configured)}</div></div>
                  <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3"><div className="text-zinc-500">Plugins discovered</div><div className="font-mono">{fmt(data.integration.plugin_inventory.discovered)}</div></div>
                </div>
                <div className={`rounded border p-3 text-sm ${data.integration.fallback_alignment.aligned ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/40 bg-amber-500/10 text-amber-200'}`}>
                  <div className="font-semibold">Fallback Alignment: {data.integration.fallback_alignment.aligned ? 'Aligned' : 'Drift Detected'}</div>
                  <div className="mt-1 text-xs">
                    project={data.integration.fallback_alignment.first_provider_project_config || 'n/a'} | root={data.integration.fallback_alignment.first_provider_root_config || 'n/a'}
                  </div>
                </div>
              </div>
            </section>

            <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-300">Health Signals</h3>
                <div className="space-y-2">
                  {data.health.signals.map((signal) => (
                    <div key={signal.key} className="rounded border border-zinc-800 bg-zinc-900/60 p-3">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm text-zinc-200">{signal.label}</span>
                        <span className={`rounded border px-2 py-0.5 text-xs ${levelClass(signal.level)}`}>{signal.level}</span>
                      </div>
                      <div className="font-mono text-sm text-zinc-300">{fmt(signal.value)} / target {fmt(signal.target)}</div>
                      <div className="text-xs text-zinc-500">{signal.detail}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-300">Pipeline + Runtime</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3"><div className="text-zinc-500">RL Skills</div><div className="font-mono">{fmt(data.pipeline.rl_skills.total)}</div></div>
                  <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3"><div className="text-zinc-500">RL Avg Success</div><div className="font-mono">{fmt(data.pipeline.rl_skills.avg_success_rate * 100)}%</div></div>
                  <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3"><div className="text-zinc-500">Anti-patterns</div><div className="font-mono">{fmt(data.pipeline.learning.anti_patterns_total)}</div></div>
                  <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3"><div className="text-zinc-500">Positive patterns</div><div className="font-mono">{fmt(data.pipeline.learning.positive_patterns_total)}</div></div>
                  <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3"><div className="text-zinc-500">P50 tokens/msg</div><div className="font-mono">{fmt(data.tokens.p50_per_message)}</div></div>
                  <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3"><div className="text-zinc-500">P90 tokens/msg</div><div className="font-mono">{fmt(data.tokens.p90_per_message)}</div></div>
                  <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3"><div className="text-zinc-500">Avg loops/session</div><div className="font-mono">{fmt(data.loops.avg_loops_per_session)}</div></div>
                  <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3"><div className="text-zinc-500">Max loops/session</div><div className="font-mono">{fmt(data.loops.max_loops_single_session)}</div></div>
                </div>
              </div>
            </section>

            <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <TopTable title="Top Models" rows={data.tokens.by_model} />
              <TopTable title="Top Skills" rows={data.tokens.by_skill} />
              <TopTable title="Top Tools" rows={data.tokens.by_tool} />
            </section>

            <section className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-300">Priority Integration Gaps</h3>
              <div className="space-y-2">
                {data.integration.gaps.length === 0 ? <div className="text-sm text-zinc-500">No structural integration gaps detected by current checks.</div> : null}
                {data.integration.gaps.map((gap) => (
                  <div key={gap.id} className={`rounded border p-3 ${severityClass(gap.severity)}`}>
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{gap.title}</span>
                      <span className="rounded border border-current/30 px-2 py-0.5 text-[11px] uppercase">{gap.severity}</span>
                      <span className="text-[11px] uppercase opacity-80">{gap.domain}</span>
                    </div>
                    <div className="text-xs opacity-90">{gap.detail}</div>
                    <div className="mt-1 text-[11px] opacity-75">Evidence: {gap.evidence}</div>
                    <div className="mt-1 text-[11px] opacity-90">Next: {gap.recommended_next_step}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-300">Data Sources</h3>
              <div className="flex flex-wrap gap-2">
                {sourceBadges.map((source) => (
                  <span key={source.source} className={`rounded border px-2 py-1 text-xs ${source.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-zinc-700 bg-zinc-900/50 text-zinc-500'}`}>
                    {source.source}: {source.ok ? 'live' : 'missing'}
                  </span>
                ))}
              </div>
              <div className="mt-3 text-xs text-zinc-500">Updated {new Date(data.generated_at).toLocaleString()}</div>
            </section>
          </>
        ) : (
          <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-6 text-zinc-400">Loading orchestration intelligence...</section>
        )}
      </div>
    </main>
  );
}
