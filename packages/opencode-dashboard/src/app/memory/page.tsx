'use client';

import { useState } from 'react';
import Link from 'next/link';
import { LearningInsights } from '@/components/dashboard/LearningInsights';
import { SkillRLDashboard } from '@/components/dashboard/SkillRLDashboard';

export default function MemoryPage() {
  const [activeTab, setActiveTab] = useState<'learning' | 'skills' | 'query'>('learning');

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-zinc-100">Intelligence Hub</h1>
        <p className="text-zinc-400 mt-2">Knowledge Graph, Learning Patterns, and Skill Evolution</p>
        <div className="mt-4">
          <Link
            href="/graph"
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-500/20"
          >
            Open full-frame Knowledge Graph
          </Link>
        </div>
      </div>

      <div className="flex gap-2 mb-6 border-b border-zinc-800 pb-4">
        <button
          onClick={() => setActiveTab('learning')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'learning' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
          }`}
        >
          Learning Insights
        </button>
        <button
          onClick={() => setActiveTab('skills')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'skills' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
          }`}
        >
          Skills RL
        </button>
        <button
          onClick={() => setActiveTab('query')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'query' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
          }`}
        >
          JARVIS Query
        </button>
      </div>

      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6 min-h-[600px]">
        {activeTab === 'learning' && <LearningInsights />}
        {activeTab === 'skills' && <SkillRLDashboard />}
        {activeTab === 'query' && (
          <div className="flex flex-col items-center justify-center h-96 text-zinc-400">
            <p className="text-lg mb-4">JARVIS Query Interface</p>
            <p className="text-sm">Natural language queries for knowledge graph exploration</p>
          </div>
        )}
      </div>
    </div>
  );
}
