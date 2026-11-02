'use client';

import { LearningInsights } from '@/components/dashboard/LearningInsights';

export default function LearningPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-100">Learning Insights</h1>
        <p className="text-zinc-400 mt-1">
          Anti-patterns, positive patterns, and AI recommendations
        </p>
      </div>
      
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
        <LearningInsights />
      </div>
    </div>
  );
}
