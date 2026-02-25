'use client';

import { useEffect, useState } from 'react';

type HealthLogEntry = {
  timestamp: string;
  level: string;
  message: string;
};

export function PluginHealthLog() {
  const [entries, setEntries] = useState<HealthLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function fetchHealthLog() {
      try {
        const response = await fetch('/api/health');
        if (!response.ok) throw new Error('Failed to load health log');
        const data = await response.json();
        if (!active) return;
        setEntries(data.healthLog || []);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchHealthLog();
    const interval = setInterval(fetchHealthLog, 30000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-4 bg-zinc-800 rounded w-1/3"></div>
        <div className="h-20 bg-zinc-800 rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-zinc-500">
        Health log unavailable: {error}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-sm text-zinc-500">
        No health log entries found. Ensure healthd is running and writing to
        <code className="ml-1 bg-zinc-800 px-1 rounded">~/.opencode/healthd.log</code>.
      </div>
    );
  }

  const levelClass = (level: string) => {
    const normalized = level.toLowerCase();
    if (normalized.includes('error')) return 'text-red-400';
    if (normalized.includes('warn')) return 'text-amber-400';
    return 'text-emerald-400';
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-zinc-100">Plugin Health Log</h3>
        <span className="text-xs text-zinc-500">Last 20 entries</span>
      </div>
      <div className="space-y-2 max-h-80 overflow-auto">
        {entries.map((entry, index) => (
          <div
            key={`${entry.timestamp}-${index}`}
            className="rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm"
          >
            <div className="flex items-center gap-3">
              <span className={`font-mono text-xs ${levelClass(entry.level)}`}>
                {entry.level.toUpperCase()}
              </span>
              <span className="text-zinc-500 text-xs">{entry.timestamp}</span>
            </div>
            <div className="text-zinc-300 mt-1">{entry.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
