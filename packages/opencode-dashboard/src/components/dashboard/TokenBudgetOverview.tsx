'use client';

import { useState, useEffect } from 'react';

interface SessionBudget {
  [model: string]: number;
}

interface BudgetData {
  sessions: {
    [sessionId: string]: SessionBudget;
  };
  savedAt: string;
}

export function TokenBudgetOverview() {
  const [data, setData] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBudgets() {
      try {
        const response = await fetch('/api/status/usage');
        if (!response.ok) throw new Error('Failed to fetch');
        const budgetData = await response.json();
        setData(budgetData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchBudgets();
    const interval = setInterval(fetchBudgets, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-4 bg-zinc-800 rounded w-1/4"></div>
        <div className="h-20 bg-zinc-800 rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-400 text-sm">
        Failed to load token budgets: {error}
      </div>
    );
  }

  // Calculate totals from available data
  const sessions = data?.sessions || {};
  const totalSessions = Object.keys(sessions).length;
  const totalTokens = Object.values(sessions).reduce((sum, session) => {
    return sum + Object.values(session).reduce((s, v) => s + v, 0);
  }, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-zinc-100">Token Budget Overview</h3>
        <span className="text-xs text-zinc-500">
          Last updated: {data?.savedAt ? new Date(data.savedAt).toLocaleString() : 'N/A'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-zinc-800/50 rounded-lg p-4">
          <div className="text-2xl font-bold text-zinc-100">{totalSessions}</div>
          <div className="text-sm text-zinc-400">Active Sessions</div>
        </div>
        <div className="bg-zinc-800/50 rounded-lg p-4">
          <div className="text-2xl font-bold text-zinc-100">
            {totalTokens.toLocaleString()}
          </div>
          <div className="text-sm text-zinc-400">Total Tokens Used</div>
        </div>
      </div>

      {totalSessions > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-zinc-300">Per-Session Breakdown</h4>
          {Object.entries(sessions).slice(0, 5).map(([sessionId, tokens]) => (
            <div key={sessionId} className="flex justify-between text-sm">
              <span className="text-zinc-400 font-mono">{sessionId}</span>
              <span className="text-zinc-200">
                {Object.values(tokens).reduce((a, b) => a + b, 0).toLocaleString()} tokens
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
