'use client';

import { useState, useEffect, useCallback } from 'react';

interface ProviderHealthStatus {
  provider: string;
  status: 'healthy' | 'rate_limited' | 'auth_error' | 'network_error' | 'unknown';
  latency?: number;
  error?: string;
  lastChecked: string;
}

interface RateLimitEntry {
  provider: string;
  model?: string;
  requests: number;
  tokensUsed: number;
  lastReset: string;
}

interface ProvidersData {
  providers: ProviderHealthStatus[];
  rateLimits: {
    providers: Record<string, RateLimitEntry>;
    models: Record<string, RateLimitEntry>;
  };
  cache?: {
    size: number;
    hits: number;
    misses: number;
    expired: number;
    hitRate: number;
  };
  timestamp: string;
}

interface ProviderPressure {
  provider: string;
  score: number;
  level: 'low' | 'medium' | 'high';
}

function pressureLevel(score: number): ProviderPressure['level'] {
  if (score >= 0.67) return 'high';
  if (score >= 0.34) return 'medium';
  return 'low';
}

function pressureClasses(level: ProviderPressure['level']) {
  if (level === 'high') return 'text-red-300 border-red-500/30 bg-red-500/10';
  if (level === 'medium') return 'text-amber-300 border-amber-500/30 bg-amber-500/10';
  return 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10';
}

export function ProviderHealth() {
  const [data, setData] = useState<ProvidersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/providers');
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const runHealthTest = useCallback(async (provider: string) => {
    setTesting(provider);
    try {
      const res = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', provider })
      });
      if (res.ok) {
        await fetchData();
      }
    } finally {
      setTesting(null);
    }
  }, [fetchData]);

  const resetUsage = useCallback(async (provider: string, model?: string) => {
    try {
      await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resetUsage', data: { provider, model } })
      });
      await fetchData();
    } catch (err) {
      console.error('Failed to reset usage:', err);
    }
  }, [fetchData]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-green-500';
      case 'rate_limited': return 'bg-orange-500';
      case 'auth_error': return 'bg-red-500';
      case 'network_error': return 'bg-yellow-500';
      default: return 'bg-zinc-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'healthy': return 'Healthy';
      case 'rate_limited': return 'Rate Limited';
      case 'auth_error': return 'Auth Error';
      case 'network_error': return 'Network Error';
      default: return 'Unknown';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
        <p className="text-red-400">Error loading providers: {error}</p>
        <button onClick={fetchData} className="mt-2 px-3 py-1 bg-red-600 rounded text-sm">
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const providerEntries = Object.entries(data.rateLimits.providers);
  const healthyCount = data.providers.filter(p => p.status === 'healthy').length;
  const rateLimitedCount = data.providers.filter(p => p.status === 'rate_limited').length;
  const errorCount = data.providers.filter(p => p.status === 'auth_error' || p.status === 'network_error').length;

  const maxRequests = Math.max(1, ...providerEntries.map(([, entry]) => entry.requests));
  const maxTokens = Math.max(1, ...providerEntries.map(([, entry]) => entry.tokensUsed));

  const pressureByProvider = new Map<string, ProviderPressure>(
    providerEntries.map(([provider, entry]) => {
      const requestPressure = entry.requests / maxRequests;
      const tokenPressure = entry.tokensUsed / maxTokens;
      const score = Math.min(1, (requestPressure * 0.45) + (tokenPressure * 0.55));
      return [provider, { provider, score, level: pressureLevel(score) }];
    })
  );

  const hottestModels = Object.values(data.rateLimits.models)
    .slice()
    .sort((a, b) => b.tokensUsed - a.tokensUsed || b.requests - a.requests)
    .slice(0, 5);

  const sortedProviders = data.providers
    .slice()
    .sort((a, b) => {
      const aScore = pressureByProvider.get(a.provider)?.score ?? 0;
      const bScore = pressureByProvider.get(b.provider)?.score ?? 0;
      return bScore - aScore;
    });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Provider Health</h3>
          <p className="text-sm text-zinc-400">
            {healthyCount}/{data.providers.length} providers healthy
          </p>
        </div>
        <button
          onClick={fetchData}
          className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-sm"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-3">
          <div className="text-xs uppercase tracking-wide text-zinc-500">Healthy</div>
          <div className="mt-1 text-lg font-semibold text-emerald-300">{healthyCount}</div>
        </div>
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-3">
          <div className="text-xs uppercase tracking-wide text-zinc-500">Rate Limited</div>
          <div className="mt-1 text-lg font-semibold text-amber-300">{rateLimitedCount}</div>
        </div>
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-3">
          <div className="text-xs uppercase tracking-wide text-zinc-500">Errors</div>
          <div className="mt-1 text-lg font-semibold text-red-300">{errorCount}</div>
        </div>
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-3">
          <div className="text-xs uppercase tracking-wide text-zinc-500">Tracked Models</div>
          <div className="mt-1 text-lg font-semibold text-zinc-200">{Object.keys(data.rateLimits.models).length}</div>
        </div>
      </div>

      {data.cache && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-3">
          <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Probe Cache</div>
          <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
            <div><span className="text-zinc-500">Size:</span> <span className="text-zinc-200">{data.cache.size}</span></div>
            <div><span className="text-zinc-500">Hits:</span> <span className="text-zinc-200">{data.cache.hits}</span></div>
            <div><span className="text-zinc-500">Misses:</span> <span className="text-zinc-200">{data.cache.misses}</span></div>
            <div><span className="text-zinc-500">Expired:</span> <span className="text-zinc-200">{data.cache.expired}</span></div>
            <div>
              <span className="text-zinc-500">Hit rate:</span>{' '}
              <span className="text-zinc-200">{Math.round(data.cache.hitRate * 100)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Provider Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {sortedProviders.map((provider) => {
          const rateLimit = data.rateLimits.providers[provider.provider];
          const pressure = pressureByProvider.get(provider.provider);
          
          return (
            <div
              key={provider.provider}
              className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${getStatusColor(provider.status)}`} />
                  <span className="font-medium capitalize">{provider.provider}</span>
                  {pressure && (
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${pressureClasses(pressure.level)}`}>
                      {pressure.level}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => runHealthTest(provider.provider)}
                  disabled={testing === provider.provider}
                  className="px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 rounded disabled:opacity-50"
                >
                  {testing === provider.provider ? 'Testing...' : 'Test'}
                </button>
              </div>

              <div className="text-xs text-zinc-400 mb-2">
                Status: {getStatusText(provider.status)}
                {provider.latency && ` • ${provider.latency}ms`}
              </div>

              {provider.error && (
                <div className="text-xs text-red-400 mb-2 truncate" title={provider.error}>
                  {provider.error}
                </div>
              )}

              {rateLimit && (
                <div className="mt-3 pt-3 border-t border-zinc-700">
                  <div className="text-xs text-zinc-400 mb-2">Rate Usage</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-zinc-500">Requests:</span>{' '}
                      <span className="text-zinc-300">{rateLimit.requests.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Tokens:</span>{' '}
                      <span className="text-zinc-300">{rateLimit.tokensUsed.toLocaleString()}</span>
                    </div>
                  </div>
                  {pressure && (
                    <div className="mt-2">
                      <div className="mb-1 flex justify-between text-[11px] text-zinc-500">
                        <span>Pressure score</span>
                        <span>{Math.round(pressure.score * 100)}%</span>
                      </div>
                      <div className="h-1.5 w-full rounded bg-zinc-700">
                        <div
                          className={`h-1.5 rounded ${pressure.level === 'high' ? 'bg-red-400' : pressure.level === 'medium' ? 'bg-amber-400' : 'bg-emerald-400'}`}
                          style={{ width: `${Math.round(pressure.score * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => resetUsage(provider.provider)}
                    className="mt-2 text-xs text-zinc-500 hover:text-zinc-300"
                  >
                    Reset Usage
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Model-level Rate Limits */}
      {Object.keys(data.rateLimits.models).length > 0 && (
        <div className="space-y-4">
          {hottestModels.length > 0 && (
            <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-3">
              <h4 className="mb-2 text-sm font-medium">Top Hot Models</h4>
              <div className="space-y-1 text-xs text-zinc-300">
                {hottestModels.map((entry, idx) => (
                  <div key={`${entry.provider}-${entry.model}-${idx}`} className="flex items-center justify-between">
                    <span className="truncate pr-2"><span className="capitalize">{entry.provider}</span> / {entry.model}</span>
                    <span className="text-zinc-400">{entry.tokensUsed.toLocaleString()} tok</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
          <h4 className="text-md font-medium mb-3">Model-Specific Usage</h4>
          <div className="bg-zinc-800/50 rounded-lg border border-zinc-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-800">
                <tr>
                  <th className="px-4 py-2 text-left text-zinc-400">Provider</th>
                  <th className="px-4 py-2 text-left text-zinc-400">Model</th>
                  <th className="px-4 py-2 text-right text-zinc-400">Requests</th>
                  <th className="px-4 py-2 text-right text-zinc-400">Tokens</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.rateLimits.models).map(([key, entry]) => (
                  <tr key={key} className="border-t border-zinc-700">
                    <td className="px-4 py-2 capitalize">{entry.provider}</td>
                    <td className="px-4 py-2 font-mono text-xs">{entry.model}</td>
                    <td className="px-4 py-2 text-right">{entry.requests.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right">{entry.tokensUsed.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => resetUsage(entry.provider!, entry.model)}
                        className="text-xs text-zinc-500 hover:text-zinc-300"
                      >
                        Reset
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        </div>
      )}

      <p className="text-xs text-zinc-500">
        Last updated: {new Date(data.timestamp).toLocaleString()}
      </p>
    </div>
  );
}
