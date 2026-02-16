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
  timestamp: string;
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

      {/* Provider Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.providers.map((provider) => {
          const rateLimit = data.rateLimits.providers[provider.provider];
          
          return (
            <div
              key={provider.provider}
              className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${getStatusColor(provider.status)}`} />
                  <span className="font-medium capitalize">{provider.provider}</span>
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
      )}

      <p className="text-xs text-zinc-500">
        Last updated: {new Date(data.timestamp).toLocaleString()}
      </p>
    </div>
  );
}
