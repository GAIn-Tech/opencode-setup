'use client';

import { useState, useEffect, useCallback } from 'react';

interface LearningReport {
  engine_version: string;
  anti_patterns: {
    total: number;
    by_type: Record<string, number>;
    by_severity: Record<string, number>;
    items: Array<{
      type: string;
      count: number;
      severity: string;
      last_seen: string;
      context?: string;
    }>;
  };
  positive_patterns: {
    total: number;
    by_type: Record<string, number>;
    avg_success_rate: number;
    items: Array<{
      type: string;
      count: number;
      success_rate: number;
      last_seen: string;
    }>;
  };
  insights: string[];
  recommendations: string[];
}

export function LearningInsights() {
  const [data, setData] = useState<LearningReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/learning');
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
  }, [fetchData]);

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'low': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default: return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';
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
        <p className="text-red-400">Error loading learning data: {error}</p>
        <button onClick={fetchData} className="mt-2 px-3 py-1 bg-red-600 rounded text-sm">
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const hasData = data.anti_patterns.total > 0 || data.positive_patterns.total > 0;

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
          <div className="text-2xl font-bold text-red-400">{data.anti_patterns.total}</div>
          <div className="text-sm text-zinc-400">Anti-Patterns</div>
        </div>
        <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4">
          <div className="text-2xl font-bold text-green-400">{data.positive_patterns.total}</div>
          <div className="text-sm text-zinc-400">Positive Patterns</div>
        </div>
        <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
          <div className="text-2xl font-bold text-blue-400">
            {(data.positive_patterns.avg_success_rate * 100).toFixed(0)}%
          </div>
          <div className="text-sm text-zinc-400">Avg Success Rate</div>
        </div>
      </div>

      {!hasData ? (
        <div className="p-8 text-center bg-zinc-800/50 rounded-lg">
          <div className="text-4xl mb-4">📊</div>
          <h3 className="text-lg font-medium text-zinc-300">No Learning Data Yet</h3>
          <p className="text-zinc-500 mt-2">
            Patterns will appear as you work. The system learns from your debugging, 
            delegation, and problem-solving approaches.
          </p>
        </div>
      ) : (
        <>
          {/* Anti-Patterns Section */}
          <div className="bg-zinc-800/50 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-red-900/30 border-b border-red-500/30">
              <h3 className="font-medium text-red-300 flex items-center gap-2">
                <span>⚠️</span> Anti-Patterns to Avoid
              </h3>
            </div>
            {data.anti_patterns.items.length === 0 ? (
              <div className="p-4 text-zinc-500">No anti-patterns detected</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-zinc-400 border-b border-zinc-700">
                    <th className="px-4 py-2">Type</th>
                    <th className="px-4 py-2">Count</th>
                    <th className="px-4 py-2">Severity</th>
                    <th className="px-4 py-2">Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {data.anti_patterns.items.map((pattern, i) => (
                    <tr
                      key={i}
                      className="border-b border-zinc-800 hover:bg-zinc-700/50 cursor-pointer"
                      onClick={() => toggleRow(`anti-${i}`)}
                    >
                      <td className="px-4 py-2 font-mono text-sm">{pattern.type}</td>
                      <td className="px-4 py-2">{pattern.count}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded text-xs border ${getSeverityColor(pattern.severity)}`}>
                          {pattern.severity}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-zinc-500 text-sm">
                        {pattern.last_seen ? new Date(pattern.last_seen).toLocaleDateString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Positive Patterns Section */}
          <div className="bg-zinc-800/50 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-green-900/30 border-b border-green-500/30">
              <h3 className="font-medium text-green-300 flex items-center gap-2">
                <span>✅</span> Positive Patterns
              </h3>
            </div>
            {data.positive_patterns.items.length === 0 ? (
              <div className="p-4 text-zinc-500">No positive patterns recorded yet</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-zinc-400 border-b border-zinc-700">
                    <th className="px-4 py-2">Type</th>
                    <th className="px-4 py-2">Count</th>
                    <th className="px-4 py-2">Success Rate</th>
                    <th className="px-4 py-2">Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {data.positive_patterns.items.map((pattern, i) => (
                    <tr key={i} className="border-b border-zinc-800 hover:bg-zinc-700/50">
                      <td className="px-4 py-2 font-mono text-sm">{pattern.type}</td>
                      <td className="px-4 py-2">{pattern.count}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-zinc-700 rounded overflow-hidden">
                            <div
                              className="h-full bg-green-500"
                              style={{ width: `${pattern.success_rate * 100}%` }}
                            />
                          </div>
                          <span className="text-sm">{(pattern.success_rate * 100).toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-zinc-500 text-sm">
                        {pattern.last_seen ? new Date(pattern.last_seen).toLocaleDateString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <div className="bg-zinc-800/50 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-blue-900/30 border-b border-blue-500/30">
            <h3 className="font-medium text-blue-300 flex items-center gap-2">
              <span>💡</span> Recommendations
            </h3>
          </div>
          <ul className="p-4 space-y-2">
            {data.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2 text-zinc-300">
                <span className="text-blue-400">•</span>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Refresh Button */}
      <button
        onClick={fetchData}
        className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-sm"
      >
        Refresh Data
      </button>
    </div>
  );
}
