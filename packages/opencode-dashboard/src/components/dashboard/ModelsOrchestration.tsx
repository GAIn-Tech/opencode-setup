'use client';
import { useState, useEffect } from 'react';

interface ModelData {
  policies: {
    models: Record<string, any>;
    fallbackLayers: Record<string, any>;
    intentRouting: Record<string, any>;
  };
}

export default function ModelsOrchestration() {
  const [data, setData] = useState<ModelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/models')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="p-8 text-zinc-400">Loading models...</div>;
  if (error) return <div className="p-8 text-red-400">Error: {error}</div>;
  if (!data?.policies) return <div className="p-8 text-zinc-400">No data</div>;

  const models = data.policies.models || {};
  const layers = data.policies.fallbackLayers || {};
  const intents = data.policies.intentRouting || {};

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-6">Models & Orchestration</h1>
      
      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800">
          <div className="text-3xl font-bold text-emerald-400">{Object.keys(models).length}</div>
          <div className="text-zinc-400">Models</div>
        </div>
        <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800">
          <div className="text-3xl font-bold text-blue-400">{Object.keys(layers).length}</div>
          <div className="text-zinc-400">Fallback Layers</div>
        </div>
        <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800">
          <div className="text-3xl font-bold text-purple-400">{Object.keys(intents).length}</div>
          <div className="text-zinc-400">Intent Categories</div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-white">Available Models</h2>
      <div className="grid grid-cols-2 gap-3">
        {Object.entries(models).map(([name, model]: [string, any]) => (
          <div key={name} className="bg-zinc-900/30 p-3 rounded border border-zinc-800">
            <div className="font-medium text-white">{name}</div>
            <div className="text-sm text-zinc-400">Provider: {model?.provider || 'unknown'}</div>
            <div className="text-sm text-zinc-400">Tier: {model?.tier || '-'}</div>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
