'use client';

import { WorkflowTree } from '@/components/dashboard/WorkflowTree';
import { EvidenceViewer } from '@/components/dashboard/EvidenceViewer';

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-200">
      <div className="p-6 max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-emerald-400 mb-2">Workflow Monitor</h1>
          <p className="text-zinc-400">Monitor workflow runs and execution evidence</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <WorkflowTree />
          </div>
          <div className="lg:col-span-2">
            <EvidenceViewer />
          </div>
        </div>
      </div>
    </main>
  );
}
