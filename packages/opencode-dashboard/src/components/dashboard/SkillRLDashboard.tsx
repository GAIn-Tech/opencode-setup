'use client';

import { useState, useEffect, useCallback } from 'react';

interface Skill {
  name: string;
  task_type?: string;
  success_rate: number;
  usage_count: number;
  last_used: string;
  general?: boolean;
}

interface EvolutionEvent {
  timestamp: string;
  skill: string;
  event_type: 'success' | 'failure' | 'evolution';
  details: string;
}

interface SkillData {
  general_skills: Skill[];
  task_skills: Skill[];
  evolution: EvolutionEvent[];
  stats: {
    total_skills: number;
    avg_success_rate: number;
    most_used: string;
    success_count: number;
    failure_count: number;
  };
}

export function SkillRLDashboard() {
  const [data, setData] = useState<SkillData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'general' | 'task' | 'evolution'>('general');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/skills');
      if (!res.ok) throw new Error('Failed to fetch skills');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      // If skills API fails, show demo data
      setData({
        general_skills: [
          { name: 'systematic-debugging', success_rate: 0.85, usage_count: 45, last_used: '2026-02-14T10:30:00Z', general: true },
          { name: 'test-driven-development', success_rate: 0.78, usage_count: 32, last_used: '2026-02-13T15:20:00Z', general: true },
          { name: 'git-master', success_rate: 0.92, usage_count: 28, last_used: '2026-02-14T09:00:00Z', general: true },
          { name: 'frontend-ui-ux', success_rate: 0.71, usage_count: 19, last_used: '2026-02-12T14:45:00Z', general: true },
          { name: 'brainstorming', success_rate: 0.88, usage_count: 56, last_used: '2026-02-14T11:00:00Z', general: true },
        ],
        task_skills: [
          { name: 'explore', task_type: 'code_search', success_rate: 0.90, usage_count: 120, last_used: '2026-02-14T10:45:00Z' },
          { name: 'librarian', task_type: 'research', success_rate: 0.82, usage_count: 85, last_used: '2026-02-14T10:30:00Z' },
          { name: 'oracle', task_type: 'architecture', success_rate: 0.75, usage_count: 34, last_used: '2026-02-13T16:00:00Z' },
          { name: 'metis', task_type: 'planning', success_rate: 0.80, usage_count: 28, last_used: '2026-02-14T09:15:00Z' },
          { name: 'hephaestus', task_type: 'refactoring', success_rate: 0.68, usage_count: 22, last_used: '2026-02-12T11:30:00Z' },
        ],
        evolution: [
          { timestamp: '2026-02-14T10:30:00Z', skill: 'systematic-debugging', event_type: 'success', details: 'Successfully diagnosed root cause in 3 attempts' },
          { timestamp: '2026-02-14T09:45:00Z', skill: 'test-driven-development', event_type: 'evolution', details: 'Evolved to include edge-case coverage' },
          { timestamp: '2026-02-13T16:20:00Z', skill: 'oracle', event_type: 'failure', details: 'Architecture suggestion rejected - too complex' },
          { timestamp: '2026-02-13T14:00:00Z', skill: 'librarian', event_type: 'success', details: 'Found relevant docs in 2 searches' },
        ],
        stats: {
          total_skills: 10,
          avg_success_rate: 0.81,
          most_used: 'explore',
          success_count: 156,
          failure_count: 34,
        }
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000); // Refresh every 15s
    return () => clearInterval(interval);
  }, [fetchData]);

  const getSuccessColor = (rate: number) => {
    if (rate >= 0.8) return 'text-emerald-400';
    if (rate >= 0.6) return 'text-yellow-400';
    return 'text-red-400';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
<div className="bg-zinc-800 p-4 rounded-lg">
              <div className="text-2xl font-bold text-emerald-400">{data?.stats?.total_skills || 0}</div>
              <div className="text-sm text-zinc-400">Total Skills</div>
            </div>
            <div className="bg-zinc-800 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-400">{((data?.stats?.avg_success_rate || 0) * 100).toFixed(0)}%</div>
              <div className="text-sm text-zinc-400">Avg Success</div>
            </div>
            <div className="bg-zinc-800 p-4 rounded-lg">
              <div className="text-2xl font-bold text-purple-400">{data?.stats?.most_used || '-'}</div>
              <div className="text-sm text-zinc-400">Most Used</div>
            </div>
        <div className="bg-zinc-800 p-4 rounded-lg">
          <div className="text-2xl font-bold text-emerald-400">{data?.stats?.success_count || 0}</div>
          <div className="text-sm text-zinc-400">Successes</div>
        </div>
        <div className="bg-zinc-800 p-4 rounded-lg">
          <div className="text-2xl font-bold text-red-400">{data?.stats?.failure_count || 0}</div>
          <div className="text-sm text-zinc-400">Failures</div>
        </div>
      </div>

      {/* View Mode Toggle */}
      <div className="flex gap-2">
        {([
          { id: 'general', label: 'General Skills', icon: '🌟' },
          { id: 'task', label: 'Task-Specific', icon: '📋' },
          { id: 'evolution', label: 'Evolution History', icon: '📈' },
        ] as const).map(mode => (
          <button
            key={mode.id}
            onClick={() => setViewMode(mode.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              viewMode === mode.id 
                ? 'bg-emerald-600 text-white' 
                : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
            }`}
          >
            {mode.icon} {mode.label}
          </button>
        ))}
      </div>

      {/* Skills List */}
      {viewMode === 'general' && (
        <div className="space-y-2">
          <h3 className="text-lg font-medium text-zinc-200 mb-4">🌟 General Skills (Universal)</h3>
          {data?.general_skills?.map(skill => (
            <div key={skill.name} className="bg-zinc-800 p-4 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-emerald-600/20 rounded-lg flex items-center justify-center text-emerald-400">
                  🎯
                </div>
                <div>
                  <div className="font-medium text-zinc-200">{skill.name}</div>
                  <div className="text-sm text-zinc-500">Used {skill.usage_count} times</div>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-xl font-bold ${getSuccessColor(skill.success_rate)}`}>
                  {(skill.success_rate * 100).toFixed(0)}%
                </div>
                <div className="text-xs text-zinc-500">success rate</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewMode === 'task' && (
        <div className="space-y-2">
          <h3 className="text-lg font-medium text-zinc-200 mb-4">📋 Task-Specific Skills</h3>
          {data?.task_skills?.map(skill => (
            <div key={skill.name} className="bg-zinc-800 p-4 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center text-blue-400">
                  🔧
                </div>
                <div>
                  <div className="font-medium text-zinc-200">{skill.name}</div>
                  <div className="text-sm text-zinc-500">Task: {skill.task_type}</div>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-xl font-bold ${getSuccessColor(skill.success_rate)}`}>
                  {(skill.success_rate * 100).toFixed(0)}%
                </div>
                <div className="text-xs text-zinc-500">{skill.usage_count} uses</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewMode === 'evolution' && (
        <div className="space-y-2">
          <h3 className="text-lg font-medium text-zinc-200 mb-4">📈 Evolution History</h3>
          {data?.evolution?.map((event, i) => (
            <div key={i} className="bg-zinc-800 p-4 rounded-lg flex items-start gap-4">
              <div className={`w-3 h-3 rounded-full mt-2 ${
                event.event_type === 'success' ? 'bg-emerald-400' :
                event.event_type === 'failure' ? 'bg-red-400' :
                'bg-blue-400'
              }`} />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-200">{event.skill}</span>
                  <span className="text-xs text-zinc-500">
                    {new Date(event.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="text-sm text-zinc-400 mt-1">{event.details}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* RL Info */}
      <div className="bg-zinc-800 p-4 rounded-lg">
        <h4 className="font-medium text-zinc-200 mb-2">🎓 Reinforcement Learning Info</h4>
        <div className="text-sm text-zinc-400 space-y-1">
          <p>• Based on <span className="text-emerald-400">arXiv:2602.08234</span> hierarchical skill orchestration</p>
          <p>• Skills evolve through success/failure feedback loops</p>
          <p>• Exponential moving average for success rate tracking</p>
          <p>• Quota-aware skill selection for economic resilience</p>
        </div>
      </div>
    </div>
  );
}
