'use client';

import { ConfigViewer } from '@/components/dashboard/ConfigViewer';

export default function ConfigPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-100">Configuration</h1>
        <p className="text-zinc-400 mt-1">
          Project, user, and plugin configuration settings
        </p>
      </div>
      
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
        <ConfigViewer />
      </div>
    </div>
  );
}
