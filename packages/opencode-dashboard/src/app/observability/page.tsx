'use client';

import { useCallback, useEffect, useState } from 'react';

// ─── Types ─────────────────────────────────────────────────────

interface DiscoveryRate {
  total: number;
  successes: number;
  failures: number;
  rate: number;
  consecutiveFailures: number;
}

interface CacheTier {
  hits: number;
  misses: number;
  total: number;
  hitRate: number;
}

interface DiscoveryAlertPrediction {
  provider: string;
  sampleSize: number;
  firstHalfFailureRate: number;
  secondHalfFailureRate: number;
  delta: number;
  predictedConsecutiveFailures: number;
  threshold?: {
    failureRate?: number;
    delta?: number;
  };
  timestamp: number;
}

interface MonitoringSnapshot {
  timestamp: number;
  discovery: Record<string, DiscoveryRate>;
  predictions?: {
    discoveryAlerts?: {
      totalEvents: number;
      byProvider: Record<string, DiscoveryAlertPrediction>;
    };
  };
  cache: { l1: CacheTier; l2: CacheTier };
  transitions: Record<string, number>;
  prCreation: { total: number; successes: number; failures: number; rate: number };
  timeToApproval: { avgMs: number; minMs: number; maxMs: number; count: number };
  catalogFreshness: { lastUpdateTimestamp: number | null; ageMs: number; stale: boolean };
}

interface ContextBudget {
  sessionId: string;
  model: string;
  used: number;
  max: number;
  pct: number;
  status: 'ok' | 'warn' | 'error' | 'exceeded';
}

interface CompressionStats {
  totalEvents: number;
  totalTokensSaved: number;
  avgCompressionRatio: number;
}

interface Context7Stats {
  totalLookups: number;
  resolved: number;
  failed: number;
  resolutionRate: number;
}

interface MetaKBSummary {
  status: string;
  generated_at: string | null;
  age_hours: number | null;
  total_records: number;
  by_risk_level?: Record<string, number>;
  category_count?: number;
  anti_pattern_count?: number;
}

interface ToolUsageStats {
  total: number;
  windowMs: number;
  successRate: number;
  successCount: number;
  failureCount: number;
  uniqueTools: number;
  breadthScore: number;
  topTools: Array<{ tool: string; count: number; lastUsed: string }>;
  byCategory: Array<{ category: string; count: number }>;
  byPriority: Record<string, number>;
  bySession: Array<{ session: string; count: number }>;
  errorClasses: Record<string, number>;
  oldestEntry: string | null;
  newestEntry: string | null;
}

interface DelegationMetrics {
  total: number;
  windowMs: number;
  successRate: number;
  successCount: number;
  failureCount: number;
  backgroundCount: number;
  continuedCount: number;
  byTaskType: Array<{ task_type: string; total: number; successRate: number }>;
  byCategory: Array<{ category: string; total: number; successRate: number }>;
  bySession: Array<{ session_id: string; count: number }>;
  topSkills: Array<{ skill: string; count: number }>;
  recentEvents: Array<{
    timestamp: string;
    session_id: string;
    task_type: string;
    category: string;
    description: string;
    success: boolean;
    background: boolean;
    load_skills: string[];
  }>;
  oldestEntry: string | null;
  newestEntry: string | null;
}

interface ErrorTrends {
  totalErrors: number;
  totalInvocations: number;
  errorRate: number;
  byErrorClass: Record<string, number>;
  byCategory: Record<string, { errors: number; total: number; rate: number }>;
  byPriority: Record<string, { errors: number; total: number }>;
  recentTrend: Array<{ bucket: string; errors: number; total: number }>;
}

interface ModelSelectionMetrics {
  totalSessions: number;
  uniqueModels: Array<{ model: string; count: number }>;
  avgTokensPerSession: number;
  modelDiversity: number;
}

// T21: Package-level execution metrics (from IntegrationLayer instrumentation)
interface PackageExecutionMetrics {
  total: number;
  windowMs: number;
  successes: number;
  failures: number;
  rate: number;
  avgDurationMs: number;
  uniquePackages: number;
  packages: Array<{
    package: string;
    total: number;
    successes: number;
    failures: number;
    rate: number;
    methods: Array<{ method: string; total: number; successes: number; failures: number; rate: number }>;
  }>;
  bySession: Array<{ sessionId: string; total: number; successes: number; failures: number; rate: number }>;
  byTaskType: Array<{ taskType: string; total: number; successes: number; failures: number; rate: number }>;
  recentFailures: Array<{ package: string; method: string; timestamp: string | null; sessionId: string | null; taskType: string | null; error: string | null; durationMs: number }>;
  oldestEntry: string | null;
  newestEntry: string | null;
}

// ─── Component ─────────────────────────────────────────────────

export default function ObservabilityPage() {
  const [monitoring, setMonitoring] = useState<MonitoringSnapshot | null>(null);
  const [metaKB, setMetaKB] = useState<MetaKBSummary | null>(null);
  const [budgets, setBudgets] = useState<ContextBudget[]>([]);
  const [compression, setCompression] = useState<CompressionStats | null>(null);
  const [context7Stats, setContext7Stats] = useState<Context7Stats | null>(null);
  const [toolUsage, setToolUsage] = useState<ToolUsageStats | null>(null);
  const [delegationMetrics, setDelegationMetrics] = useState<DelegationMetrics | null>(null);
  const [errorTrends, setErrorTrends] = useState<ErrorTrends | null>(null);
  const [modelSelection, setModelSelection] = useState<ModelSelectionMetrics | null>(null);
  const [packageExecution, setPackageExecution] = useState<PackageExecutionMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string>('');

  const fetchData = useCallback(async () => {
    try {
      const [monRes, kbRes, budgetRes, compressionRes, ctx7Res, toolRes, delRes, errRes, modelRes, pkgRes] = await Promise.allSettled([
        fetch('/api/monitoring').then(r => r.ok ? r.json() : null),
        fetch('/api/meta-kb').then(r => r.ok ? r.json() : null),
        fetch('/api/budget').then(r => r.ok ? r.json() : null),
        fetch('/api/compression').then(r => r.ok ? r.json() : null),
        fetch('/api/context7-stats').then(r => r.ok ? r.json() : null),
        fetch('/api/tool-usage').then(r => r.ok ? r.json() : null),
        fetch('/api/delegation-metrics').then(r => r.ok ? r.json() : null),
        fetch('/api/error-trends').then(r => r.ok ? r.json() : null),
        fetch('/api/model-selection').then(r => r.ok ? r.json() : null),
        fetch('/api/package-execution').then(r => r.ok ? r.json() : null),
      ]);

      if (monRes.status === 'fulfilled' && monRes.value) {
        setMonitoring(monRes.value);
      }
      if (kbRes.status === 'fulfilled' && kbRes.value) {
        setMetaKB(kbRes.value);
      }
      if (budgetRes.status === 'fulfilled' && budgetRes.value) {
        setBudgets(Array.isArray(budgetRes.value) ? budgetRes.value : []);
      }
      if (compressionRes.status === 'fulfilled' && compressionRes.value) {
        setCompression(compressionRes.value);
      }
      if (ctx7Res.status === 'fulfilled' && ctx7Res.value) {
        setContext7Stats(ctx7Res.value);
      }
      if (toolRes.status === 'fulfilled' && toolRes.value) {
        setToolUsage(toolRes.value);
      }
      if (delRes.status === 'fulfilled' && delRes.value) {
        setDelegationMetrics(delRes.value);
      }
      if (errRes.status === 'fulfilled' && errRes.value) {
        setErrorTrends(errRes.value);
      }
      if (modelRes.status === 'fulfilled' && modelRes.value) {
        setModelSelection(modelRes.value);
      }
      if (pkgRes.status === 'fulfilled' && pkgRes.value) {
        setPackageExecution(pkgRes.value);
      }

      setLastRefresh(new Date().toLocaleTimeString());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000); // 30s polling
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="text-zinc-400 text-lg animate-pulse">Loading observability data...</div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Observability</h1>
          <p className="text-zinc-400 mt-1">Pipeline metrics, cache performance, and system health</p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-zinc-500">Last refresh: {lastRefresh}</span>
          )}
          <button
            onClick={fetchData}
            className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Top-level status cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Meta-KB Status */}
        <StatusCard
          title="Meta-KB Health"
          value={metaKB?.status ?? 'unknown'}
          color={metaKB?.status === 'healthy' ? 'emerald' : metaKB?.status === 'stale' ? 'amber' : 'red'}
          subtitle={metaKB?.total_records ? `${metaKB.total_records} records` : 'No data'}
          detail={metaKB?.age_hours != null ? `${metaKB.age_hours}h old` : ''}
        />

        {/* Catalog Freshness */}
        <StatusCard
          title="Catalog Freshness"
          value={monitoring?.catalogFreshness?.stale ? 'Stale' : 'Fresh'}
          color={monitoring?.catalogFreshness?.stale ? 'amber' : 'emerald'}
          subtitle={monitoring?.catalogFreshness?.ageMs != null && monitoring.catalogFreshness.ageMs >= 0
            ? `${Math.round(monitoring.catalogFreshness.ageMs / 60000)}m ago`
            : 'Unknown'}
        />

        {/* PR Success Rate */}
        <StatusCard
          title="PR Creation"
          value={monitoring?.prCreation ? `${Math.round(monitoring.prCreation.rate * 100)}%` : 'N/A'}
          color={monitoring?.prCreation && monitoring.prCreation.rate >= 0.8 ? 'emerald' :
                 monitoring?.prCreation && monitoring.prCreation.rate >= 0.5 ? 'amber' : 'zinc'}
          subtitle={monitoring?.prCreation ? `${monitoring.prCreation.total} total` : ''}
        />
      </div>

      {/* T15: Context Budget */}
      {(budgets.length > 0 || compression || context7Stats) && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Context Budget</h2>
          <div className="space-y-4">
            {/* Active session budgets */}
            {budgets.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {budgets.map((b) => {
                  const pctDisplay = Math.round(b.pct * 100);
                  const barColor = b.pct >= 0.80 ? 'bg-red-500' : b.pct >= 0.75 ? 'bg-amber-500' : 'bg-emerald-500';
                  const textColor = b.pct >= 0.80 ? 'text-red-400' : b.pct >= 0.75 ? 'text-amber-400' : 'text-emerald-400';
                  return (
                    <div key={`${b.sessionId}-${b.model}`} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-zinc-300 truncate max-w-[60%]" title={b.model}>{b.model}</span>
                        <span className={`text-sm font-bold ${textColor}`}>{pctDisplay}%</span>
                      </div>
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden mb-2">
                        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(pctDisplay, 100)}%` }} />
                      </div>
                      <div className="flex justify-between text-xs text-zinc-500">
                        <span>{b.used.toLocaleString()} used</span>
                        <span>{b.max.toLocaleString()} max</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Compression + Context7 stats row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {compression && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-zinc-200 mb-3">Distill Compression</h3>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <div className="text-xs text-zinc-500">Events</div>
                      <div className="text-lg font-bold text-zinc-200">{compression.totalEvents}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">Tokens Saved</div>
                      <div className="text-lg font-bold text-emerald-400">{compression.totalTokensSaved.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">Avg Ratio</div>
                      <div className="text-lg font-bold text-zinc-200">{(compression.avgCompressionRatio * 100).toFixed(1)}%</div>
                    </div>
                  </div>
                </div>
              )}
              {context7Stats && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-zinc-200 mb-3">Context7 Lookups</h3>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <div className="text-xs text-zinc-500">Total</div>
                      <div className="text-lg font-bold text-zinc-200">{context7Stats.totalLookups}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">Resolved</div>
                      <div className="text-lg font-bold text-emerald-400">{context7Stats.resolved}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">Rate</div>
                      <div className="text-lg font-bold text-zinc-200">{(context7Stats.resolutionRate * 100).toFixed(1)}%</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Discovery Rates */}
      {monitoring && Object.keys(monitoring.discovery).length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Discovery Rates</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(monitoring.discovery).map(([provider, stats]) => (
              <div key={provider} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-zinc-300 capitalize">{provider}</span>
                  <span className={`text-sm font-bold ${stats.rate >= 0.8 ? 'text-emerald-400' : stats.rate >= 0.5 ? 'text-amber-400' : 'text-red-400'}`}>
                    {(stats.rate * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full rounded-full ${stats.rate >= 0.8 ? 'bg-emerald-500' : stats.rate >= 0.5 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.round(stats.rate * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-zinc-500">
                  <span>{stats.successes} ok / {stats.failures} fail</span>
                  {stats.consecutiveFailures > 0 && (
                    <span className="text-red-400">{stats.consecutiveFailures} consec.</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Predictive Discovery Alerts */}
      {monitoring?.predictions?.discoveryAlerts && Object.keys(monitoring.predictions.discoveryAlerts.byProvider || {}).length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Predictive Discovery Alerts</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(monitoring.predictions.discoveryAlerts.byProvider)
              .sort((a, b) => b[1].secondHalfFailureRate - a[1].secondHalfFailureRate)
              .map(([provider, prediction]) => (
                <div key={provider} className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-zinc-200 capitalize">{provider}</span>
                    <span className="text-xs px-2 py-0.5 rounded border border-amber-500/30 text-amber-400 bg-amber-500/10">
                      advisory
                    </span>
                  </div>
                  <div className="space-y-1 text-xs text-zinc-400">
                    <div className="flex justify-between">
                      <span>Failure rate (recent)</span>
                      <span className="text-amber-300 font-medium">{(prediction.secondHalfFailureRate * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Failure trend delta</span>
                      <span className="text-zinc-200">+{(prediction.delta * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Sample size</span>
                      <span className="text-zinc-200">{prediction.sampleSize}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pred. consecutive failures</span>
                      <span className="text-zinc-200">{prediction.predictedConsecutiveFailures}</span>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Cache Performance */}
      {monitoring?.cache && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Cache Performance</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(['l1', 'l2'] as const).map((tier) => {
              const t = monitoring.cache[tier];
              return (
                <div key={tier} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-zinc-200 uppercase">{tier} Cache</h3>
                    <span className={`text-sm font-bold ${t.hitRate >= 0.8 ? 'text-emerald-400' : t.hitRate >= 0.5 ? 'text-amber-400' : 'text-red-400'}`}>
                      {(t.hitRate * 100).toFixed(1)}% hit
                    </span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-2">
                    <div
                      className={`h-full rounded-full ${t.hitRate >= 0.8 ? 'bg-emerald-500' : t.hitRate >= 0.5 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.round(t.hitRate * 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>{t.hits} hits</span>
                    <span>{t.misses} misses</span>
                    <span>{t.total} total</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Tool Usage */}
      {toolUsage && toolUsage.total > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Tool Usage</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
                <div className="text-xs text-zinc-500 mb-1">Total Calls</div>
                <div className="text-xl font-bold text-zinc-200">{toolUsage.total}</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
                <div className="text-xs text-zinc-500 mb-1">Success Rate</div>
                <div className={`text-xl font-bold ${toolUsage.successRate >= 0.9 ? 'text-emerald-400' : toolUsage.successRate >= 0.7 ? 'text-amber-400' : 'text-red-400'}`}>
                  {(toolUsage.successRate * 100).toFixed(1)}%
                </div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
                <div className="text-xs text-zinc-500 mb-1">Unique Tools</div>
                <div className="text-xl font-bold text-zinc-200">{toolUsage.uniqueTools}</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
                <div className="text-xs text-zinc-500 mb-1">Breadth Score</div>
                <div className="text-xl font-bold text-zinc-200">{toolUsage.breadthScore.toFixed(2)}</div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {toolUsage.topTools.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-zinc-200 mb-3">Top Tools</h3>
                  <div className="space-y-1.5">
                    {toolUsage.topTools.slice(0, 10).map((t) => (
                      <div key={t.tool} className="flex items-center justify-between text-sm">
                        <span className="text-zinc-400 font-mono truncate max-w-[70%]" title={t.tool}>{t.tool}</span>
                        <span className="text-zinc-200 font-medium">{t.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {toolUsage.byCategory.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-zinc-200 mb-3">By Category</h3>
                  <div className="space-y-1.5">
                    {toolUsage.byCategory.slice(0, 10).map((c) => (
                      <div key={c.category} className="flex items-center justify-between text-sm">
                        <span className="text-zinc-400 capitalize">{c.category}</span>
                        <span className="text-zinc-200 font-medium">{c.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Delegation Metrics */}
      {delegationMetrics && delegationMetrics.total > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Delegation Metrics</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
                <div className="text-xs text-zinc-500 mb-1">Total Delegations</div>
                <div className="text-xl font-bold text-zinc-200">{delegationMetrics.total}</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
                <div className="text-xs text-zinc-500 mb-1">Success Rate</div>
                <div className={`text-xl font-bold ${delegationMetrics.successRate >= 0.9 ? 'text-emerald-400' : delegationMetrics.successRate >= 0.7 ? 'text-amber-400' : 'text-red-400'}`}>
                  {(delegationMetrics.successRate * 100).toFixed(1)}%
                </div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
                <div className="text-xs text-zinc-500 mb-1">Background</div>
                <div className="text-xl font-bold text-zinc-200">{delegationMetrics.backgroundCount}</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
                <div className="text-xs text-zinc-500 mb-1">Continued Sessions</div>
                <div className="text-xl font-bold text-zinc-200">{delegationMetrics.continuedCount}</div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {delegationMetrics.byTaskType.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-zinc-200 mb-3">By Task Type</h3>
                  <div className="space-y-1.5">
                    {delegationMetrics.byTaskType.slice(0, 10).map((t) => (
                      <div key={t.task_type} className="flex items-center justify-between text-sm">
                        <span className="text-zinc-400 capitalize">{t.task_type}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500 text-xs">{t.total}</span>
                          <span className={`text-xs font-medium ${t.successRate >= 0.9 ? 'text-emerald-400' : t.successRate >= 0.7 ? 'text-amber-400' : 'text-red-400'}`}>
                            {(t.successRate * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {delegationMetrics.topSkills.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-zinc-200 mb-3">Top Skills Used</h3>
                  <div className="space-y-1.5">
                    {delegationMetrics.topSkills.slice(0, 10).map((s) => (
                      <div key={s.skill} className="flex items-center justify-between text-sm">
                        <span className="text-zinc-400 font-mono truncate max-w-[70%]" title={s.skill}>{s.skill}</span>
                        <span className="text-zinc-200 font-medium">{s.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* T18: Error Trend Analysis */}
      {errorTrends && errorTrends.totalInvocations > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Error Trends</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
                <div className="text-xs text-zinc-500 mb-1">Total Invocations</div>
                <div className="text-xl font-bold text-zinc-200">{errorTrends.totalInvocations}</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
                <div className="text-xs text-zinc-500 mb-1">Total Errors</div>
                <div className="text-xl font-bold text-red-400">{errorTrends.totalErrors}</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
                <div className="text-xs text-zinc-500 mb-1">Error Rate</div>
                <div className={`text-xl font-bold ${errorTrends.errorRate >= 0.1 ? 'text-red-400' : errorTrends.errorRate >= 0.05 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {(errorTrends.errorRate * 100).toFixed(2)}%
                </div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
                <div className="text-xs text-zinc-500 mb-1">Error Classes</div>
                <div className="text-xl font-bold text-zinc-200">{Object.keys(errorTrends.byErrorClass).length}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.keys(errorTrends.byErrorClass).length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-zinc-200 mb-3">Error Classes</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(errorTrends.byErrorClass)
                      .sort((a, b) => b[1] - a[1])
                      .map(([cls, count]) => (
                        <span key={cls} className="text-xs px-2 py-1 bg-red-500/10 border border-red-500/20 text-red-400 rounded">
                          {cls}: {count}
                        </span>
                      ))}
                  </div>
                </div>
              )}

              {errorTrends.recentTrend.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-zinc-200 mb-3">Hourly Trend</h3>
                  <div className="flex items-end gap-0.5 h-12">
                    {errorTrends.recentTrend.slice(-24).map((bucket) => {
                      const maxErrors = Math.max(...errorTrends.recentTrend.map(b => b.errors), 1);
                      const heightPct = Math.round((bucket.errors / maxErrors) * 100);
                      return (
                        <div
                          key={bucket.bucket}
                          className="flex-1 bg-red-500/60 hover:bg-red-500 rounded-t transition-colors"
                          style={{ height: `${Math.max(heightPct, 2)}%` }}
                          title={`${bucket.bucket}: ${bucket.errors} errors / ${bucket.total} invocations`}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {Object.keys(errorTrends.byCategory).length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-zinc-200 mb-3">Errors by Category</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {Object.entries(errorTrends.byCategory)
                    .sort((a, b) => b[1].errors - a[1].errors)
                    .map(([cat, stats]) => (
                      <div key={cat} className="flex items-center justify-between text-sm">
                        <span className="text-zinc-400 capitalize">{cat}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500">{stats.errors}/{stats.total}</span>
                          <span className={`text-xs font-medium ${stats.rate >= 0.1 ? 'text-red-400' : stats.rate >= 0.05 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {(stats.rate * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* T20: Model Selection Quality */}
      {modelSelection && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Model Selection</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
                <div className="text-xs text-zinc-500 mb-1">Total Sessions</div>
                <div className="text-xl font-bold text-zinc-200">{modelSelection.totalSessions}</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
                <div className="text-xs text-zinc-500 mb-1">Unique Models</div>
                <div className="text-xl font-bold text-zinc-200">{modelSelection.modelDiversity}</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
                <div className="text-xs text-zinc-500 mb-1">Avg Tokens/Session</div>
                <div className="text-xl font-bold text-zinc-200">{modelSelection.avgTokensPerSession.toLocaleString()}</div>
              </div>
            </div>

            {modelSelection.uniqueModels.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-zinc-200 mb-3">Model Usage</h3>
                <div className="space-y-1.5">
                  {modelSelection.uniqueModels.map((m) => (
                    <div key={m.model} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-400 font-mono truncate max-w-[70%]" title={m.model}>{m.model}</span>
                      <span className="text-zinc-200 font-medium ml-2">{m.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* T21: Package-Level Execution Metrics */}
      {packageExecution && packageExecution.total > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Package Execution</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
                <div className="text-xs text-zinc-500 mb-1">Total Calls</div>
                <div className="text-xl font-bold text-zinc-200">{packageExecution.total}</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
                <div className="text-xs text-zinc-500 mb-1">Success Rate</div>
                <div className={`text-xl font-bold ${packageExecution.rate >= 0.9 ? 'text-emerald-400' : packageExecution.rate >= 0.7 ? 'text-amber-400' : 'text-red-400'}`}>
                  {(packageExecution.rate * 100).toFixed(1)}%
                </div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
                <div className="text-xs text-zinc-500 mb-1">Packages Active</div>
                <div className="text-xl font-bold text-zinc-200">{packageExecution.uniquePackages}</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
                <div className="text-xs text-zinc-500 mb-1">Avg Latency</div>
                <div className="text-xl font-bold text-zinc-200">{packageExecution.avgDurationMs.toFixed(1)}ms</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {packageExecution.packages.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-zinc-200 mb-3">By Package</h3>
                  <div className="space-y-2">
                    {packageExecution.packages.slice(0, 8).map((pkg) => (
                      <div key={pkg.package}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-zinc-400 font-mono">{pkg.package}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-500 text-xs">{pkg.total}</span>
                            <span className={`text-xs font-medium ${pkg.rate >= 0.9 ? 'text-emerald-400' : pkg.rate >= 0.7 ? 'text-amber-400' : 'text-red-400'}`}>
                              {(pkg.rate * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                        <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${pkg.rate >= 0.9 ? 'bg-emerald-500' : pkg.rate >= 0.7 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.round(pkg.rate * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {packageExecution.recentFailures.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-zinc-200 mb-3">Recent Failures</h3>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {packageExecution.recentFailures.slice(0, 15).map((ev, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-red-400 mt-1" />
                        <span className="text-zinc-500 shrink-0">{ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : '—'}</span>
                        <span className="text-zinc-400 font-mono">{ev.package}</span>
                        <span className="text-zinc-500">→</span>
                        <span className="text-zinc-400 font-mono">{ev.method}</span>
                        <span className="text-zinc-600 truncate flex-1" title={ev.error || ''}>{ev.error || 'unknown'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {packageExecution.byTaskType.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-zinc-200 mb-3">By Task Type</h3>
                  <div className="space-y-1.5">
                    {packageExecution.byTaskType.slice(0, 10).map((t) => (
                      <div key={t.taskType} className="flex items-center justify-between text-sm">
                        <span className="text-zinc-400 capitalize">{t.taskType}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500 text-xs">{t.total}</span>
                          <span className={`text-xs font-medium ${t.rate >= 0.9 ? 'text-emerald-400' : t.rate >= 0.7 ? 'text-amber-400' : 'text-red-400'}`}>
                            {(t.rate * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────

function StatusCard({
  title, value, color, subtitle, detail,
}: {
  title: string;
  value: string;
  color: 'emerald' | 'amber' | 'red' | 'zinc';
  subtitle?: string;
  detail?: string;
}) {
  const colorMap = {
    emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    red: 'bg-red-500/10 border-red-500/20 text-red-400',
    zinc: 'bg-zinc-800 border-zinc-700 text-zinc-400',
  };

  return (
    <div className={`border rounded-lg p-4 ${colorMap[color]}`}>
      <div className="text-xs uppercase tracking-wider opacity-70 mb-1">{title}</div>
      <div className="text-xl font-bold">{value}</div>
      {subtitle && <div className="text-xs mt-1 opacity-70">{subtitle}</div>}
      {detail && <div className="text-xs mt-0.5 opacity-50">{detail}</div>}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className="text-lg font-bold text-zinc-200">{value}</div>
    </div>
  );
}
