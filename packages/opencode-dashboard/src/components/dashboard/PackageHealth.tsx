'use client';

import { useState, useEffect, useCallback } from 'react';

interface HealthData {
  status: 'healthy' | 'degraded' | 'critical';
  packages: Array<{
    name: string;
    version?: string;
    hasPackageJson: boolean;
    description?: string;
  }>;
  healthLog: Array<{
    timestamp: string;
    level: string;
    message: string;
  }>;
  budgets: Record<string, { used: number; limit: number }>;
  stats: {
    totalPackages: number;
    packagesWithJson: number;
    errorCount: number;
    warnCount: number;
  };
}

export function PackageHealth() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error('Failed to fetch');
      setData(await res.json());
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [fetchData]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-green-500';
      case 'degraded': return 'bg-yellow-500';
      case 'critical': return 'bg-red-500';
      default: return 'bg-zinc-500';
    }
  };

  const getLevelColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error': return 'text-red-400';
      case 'warn':
      case 'warning': return 'text-yellow-400';
      case 'info': return 'text-blue-400';
      default: return 'text-zinc-400';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
        <p className="text-red-400">Error loading health data: {error}</p>
        <button onClick={fetchData} className="mt-2 px-3 py-1 bg-red-600 rounded text-sm">
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Overall Status */}
      <div className="flex items-center gap-4 p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
        <div className={`w-4 h-4 rounded-full ${getStatusColor(data.status)} animate-pulse`} />
        <div>
          <div className="font-medium capitalize">{data.status}</div>
          <div className="text-sm text-zinc-400">
            {data.stats.totalPackages} packages • {data.stats.errorCount} errors • {data.stats.warnCount} warnings
          </div>
        </div>
        <button
          onClick={fetchData}
          className="ml-auto px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-sm"
        >
          Refresh
        </button>
      </div>

      {/* Packages Grid */}
      <div>
        <h3 className="text-lg font-medium mb-3">Packages</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {data.packages.map((pkg) => (
            <div
              key={pkg.name}
              className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700 hover:border-zinc-600"
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-2 h-2 rounded-full ${pkg.hasPackageJson ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="font-mono text-sm truncate" title={pkg.name}>
                  {pkg.name.replace('opencode-', '')}
                </span>
              </div>
              {pkg.version && (
                <div className="text-xs text-zinc-500">v{pkg.version}</div>
              )}
              {pkg.description && (
                <div className="text-xs text-zinc-400 mt-1 truncate" title={pkg.description}>
                  {pkg.description}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Health Log */}
      <div>
        <h3 className="text-lg font-medium mb-3">Health Log</h3>
        {data.healthLog.length === 0 ? (
          <div className="p-4 bg-zinc-800/50 rounded-lg text-zinc-500">
            No health log entries yet
          </div>
        ) : (
          <div className="bg-zinc-800/50 rounded-lg border border-zinc-700 max-h-64 overflow-y-auto">
            {data.healthLog.map((entry, i) => (
              <div
                key={i}
                className="px-4 py-2 border-b border-zinc-700 last:border-0 flex gap-3 text-sm"
              >
                <span className="text-zinc-500 font-mono text-xs whitespace-nowrap">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                <span className={`font-medium uppercase text-xs w-12 ${getLevelColor(entry.level)}`}>
                  {entry.level}
                </span>
                <span className="text-zinc-300 truncate">{entry.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resource Usage */}
      {data.budgets && typeof data.budgets === 'object' && (() => {
        // Extract session budget entries from the nested budgets structure
        const sessions = data.budgets.sessions || data.budgets;
        const budgetEntries = Object.entries(sessions).filter(
          ([key, val]) => key !== 'savedAt' && typeof val === 'object' && val !== null
        );
        if (budgetEntries.length === 0) return null;
        
        return (
          <div>
            <h3 className="text-lg font-medium mb-3">Resource Usage</h3>
            <div className="space-y-3">
              {budgetEntries.map(([sessionId, models]: [string, any]) => {
                // Each session has model -> usage entries
                const modelEntries = Object.entries(models).filter(
                  ([, v]) => typeof v === 'number' || (typeof v === 'object' && v !== null)
                );
                
                return modelEntries.map(([model, usage]: [string, any]) => {
                  const used = typeof usage === 'number' ? usage : (usage?.used ?? 0);
                  const limit = typeof usage === 'object' ? (usage?.limit ?? 0) : 0;
                  const percentage = limit > 0 ? (used / limit) * 100 : (used > 0 ? 100 : 0);
                  const color = percentage > 90 ? 'bg-red-500' : percentage > 70 ? 'bg-yellow-500' : 'bg-emerald-500';
                  
                  return (
                    <div key={`${sessionId}-${model}`} className="p-3 bg-zinc-800/50 rounded-lg">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-mono text-zinc-300">{sessionId}</span>
                        <span className="text-zinc-500 text-xs">{model}</span>
                      </div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-zinc-400">
                          {typeof used === 'number' ? used.toLocaleString() : '0'}
                          {limit > 0 ? ` / ${limit.toLocaleString()}` : ' tokens'}
                        </span>
                      </div>
                      {limit > 0 && (
                        <div className="w-full h-2 bg-zinc-700 rounded overflow-hidden">
                          <div
                            className={`h-full ${color} transition-all`}
                            style={{ width: `${Math.min(100, percentage)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                });
              })}
            </div>
          </div>
        );
      })()}

      <p className="text-xs text-zinc-500">
        Auto-refreshes every 30 seconds
      </p>
    </div>
  );
}
