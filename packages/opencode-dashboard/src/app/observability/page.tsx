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

interface MonitoringSnapshot {
  timestamp: number;
  discovery: Record<string, DiscoveryRate>;
  cache: { l1: CacheTier; l2: CacheTier };
  transitions: Record<string, number>;
  prCreation: { total: number; successes: number; failures: number; rate: number };
  timeToApproval: { avgMs: number; minMs: number; maxMs: number; count: number };
  catalogFreshness: { lastUpdateTimestamp: number | null; ageMs: number; stale: boolean };
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

// ─── Component ─────────────────────────────────────────────────

export default function ObservabilityPage() {
  const [monitoring, setMonitoring] = useState<MonitoringSnapshot | null>(null);
  const [metaKB, setMetaKB] = useState<MetaKBSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string>('');

  const fetchData = useCallback(async () => {
    try {
      const [monRes, kbRes] = await Promise.allSettled([
        fetch('/api/monitoring').then(r => r.ok ? r.json() : null),
        fetch('/api/meta-kb').then(r => r.ok ? r.json() : null),
      ]);

      if (monRes.status === 'fulfilled' && monRes.value) {
        setMonitoring(monRes.value);
      }
      if (kbRes.status === 'fulfilled' && kbRes.value) {
        setMetaKB(kbRes.value);
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

      {/* Discovery Metrics */}
      {monitoring?.discovery && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Discovery Rates by Provider</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(monitoring.discovery).map(([provider, data]) => (
              <div key={provider} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-zinc-300 capitalize">{provider}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    data.rate >= 0.9 ? 'bg-emerald-500/20 text-emerald-400' :
                    data.rate >= 0.5 ? 'bg-amber-500/20 text-amber-400' :
                    data.total === 0 ? 'bg-zinc-700 text-zinc-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>
                    {data.total === 0 ? 'No data' : `${Math.round(data.rate * 100)}%`}
                  </span>
                </div>
                <div className="flex gap-4 text-xs text-zinc-500">
                  <span>{data.successes} ok</span>
                  <span>{data.failures} fail</span>
                  {data.consecutiveFailures > 0 && (
                    <span className="text-red-400">{data.consecutiveFailures} consecutive</span>
                  )}
                </div>
                {/* Mini bar */}
                <div className="mt-2 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      data.rate >= 0.9 ? 'bg-emerald-500' :
                      data.rate >= 0.5 ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.round(data.rate * 100)}%` }}
                  />
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
            {(['l1', 'l2'] as const).map(tier => {
              const data = monitoring.cache[tier];
              return (
                <div key={tier} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-zinc-200 uppercase">{tier} Cache</span>
                    <span className={`text-lg font-bold ${
                      data.hitRate >= 0.8 ? 'text-emerald-400' :
                      data.hitRate >= 0.5 ? 'text-amber-400' : 'text-zinc-400'
                    }`}>
                      {data.total === 0 ? '-' : `${Math.round(data.hitRate * 100)}%`}
                    </span>
                  </div>
                  <div className="flex gap-6 text-xs text-zinc-500">
                    <span className="text-emerald-400">{data.hits} hits</span>
                    <span className="text-red-400">{data.misses} misses</span>
                    <span>{data.total} total</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* State Transitions */}
      {monitoring?.transitions && Object.keys(monitoring.transitions).length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">State Transitions</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {Object.entries(monitoring.transitions).map(([transition, count]) => (
                <div key={transition} className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400 font-mono">{transition}</span>
                  <span className="text-sm font-bold text-zinc-200">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Time to Approval */}
      {monitoring?.timeToApproval && monitoring.timeToApproval.count > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Time to Approval</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard label="Average" value={`${Math.round(monitoring.timeToApproval.avgMs / 1000)}s`} />
            <MetricCard label="Min" value={`${Math.round(monitoring.timeToApproval.minMs / 1000)}s`} />
            <MetricCard label="Max" value={`${Math.round(monitoring.timeToApproval.maxMs / 1000)}s`} />
            <MetricCard label="Count" value={String(monitoring.timeToApproval.count)} />
          </div>
        </section>
      )}

      {/* Meta-KB Details */}
      {metaKB && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Meta-KB Details</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-zinc-500 block">Status</span>
                <span className={`font-medium ${
                  metaKB.status === 'healthy' ? 'text-emerald-400' :
                  metaKB.status === 'stale' ? 'text-amber-400' : 'text-red-400'
                }`}>{metaKB.status}</span>
              </div>
              <div>
                <span className="text-zinc-500 block">Total Records</span>
                <span className="text-zinc-200 font-medium">{metaKB.total_records}</span>
              </div>
              {metaKB.category_count != null && (
                <div>
                  <span className="text-zinc-500 block">Categories</span>
                  <span className="text-zinc-200 font-medium">{metaKB.category_count}</span>
                </div>
              )}
              {metaKB.anti_pattern_count != null && (
                <div>
                  <span className="text-zinc-500 block">Anti-Patterns</span>
                  <span className="text-zinc-200 font-medium">{metaKB.anti_pattern_count}</span>
                </div>
              )}
            </div>
            {metaKB.by_risk_level && Object.keys(metaKB.by_risk_level).length > 0 && (
              <div className="pt-2 border-t border-zinc-800">
                <span className="text-xs text-zinc-500 block mb-2">Risk Distribution</span>
                <div className="flex gap-3">
                  {Object.entries(metaKB.by_risk_level).map(([level, count]) => (
                    <span key={level} className={`text-xs px-2 py-1 rounded ${
                      level === 'low' ? 'bg-emerald-500/20 text-emerald-400' :
                      level === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {level}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}
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
