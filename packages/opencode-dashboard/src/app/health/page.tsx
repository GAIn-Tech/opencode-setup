'use client';

import { PackageHealth } from '@/components/dashboard/PackageHealth';
import { ProviderHealth } from '@/components/dashboard/ProviderHealth';
import { TokenBudgetOverview } from '@/components/dashboard/TokenBudgetOverview';
import { MCPServerStatus } from '@/components/dashboard/MCPServerStatus';
import { PluginHealthLog } from '@/components/dashboard/PluginHealthLog';

export default function HealthPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-100">System Health</h1>
        <p className="text-zinc-400 mt-1">
          Package status, health metrics, token budgets, and provider API status
        </p>
      </div>
      
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
        <TokenBudgetOverview />
      </div>

      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
        <MCPServerStatus />
      </div>

      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
        <PluginHealthLog />
      </div>

      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
        <ProviderHealth />
      </div>

      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
        <PackageHealth />
      </div>
    </div>
  );
}
