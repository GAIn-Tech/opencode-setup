'use client';

import { useState, useEffect } from 'react';

interface MCPConfig {
  [server: string]: {
    type: 'local' | 'remote';
    command?: string[];
    url?: string;
    environment?: Record<string, string>;
    enabled: boolean;
  };
}

interface MCPServerStatus {
  name: string;
  type: 'local' | 'remote';
  enabled: boolean;
  status: 'enabled' | 'disabled' | 'configured';
}

export function MCPServerStatus() {
  const [servers, setServers] = useState<MCPServerStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMCPConfig() {
      try {
        const response = await fetch('/api/config');
        if (!response.ok) throw new Error('Failed to load config');
        const data = await response.json();
        const mcpConfig: MCPConfig = data?.opencodeRegistry?.data?.mcp || {};
        const serverList: MCPServerStatus[] = Object.entries(mcpConfig).map(([name, config]) => ({
          name,
          type: config.type,
          enabled: config.enabled,
          status: config.enabled ? 'enabled' : 'disabled'
        }));
        
        setServers(serverList);
      } catch (err) {
        // Show demo data if config unavailable
        setServers([
          { name: 'supermemory', type: 'remote', enabled: true, status: 'enabled' },
          { name: 'context7', type: 'remote', enabled: true, status: 'enabled' },
          { name: 'sequentialthinking', type: 'local', enabled: true, status: 'enabled' },
          { name: 'websearch', type: 'local', enabled: true, status: 'enabled' },
          { name: 'grep', type: 'local', enabled: true, status: 'enabled' },
          { name: 'tavily', type: 'local', enabled: false, status: 'disabled' },
          { name: 'playwright', type: 'local', enabled: false, status: 'disabled' },
          { name: 'github', type: 'local', enabled: false, status: 'disabled' },
        ]);
      } finally {
        setLoading(false);
      }
    }

    fetchMCPConfig();
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-4 bg-zinc-800 rounded w-1/4"></div>
        <div className="h-16 bg-zinc-800 rounded"></div>
      </div>
    );
  }

  const enabledCount = servers.filter(s => s.enabled).length;
  const disabledCount = servers.filter(s => !s.enabled).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-zinc-100">MCP Server Status</h3>
        <div className="flex gap-3 text-sm">
          <span className="text-emerald-400">{enabledCount} enabled</span>
          <span className="text-zinc-500">|</span>
          <span className="text-zinc-400">{disabledCount} disabled</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {servers.map((server) => (
          <div
            key={server.name}
            className={`rounded-lg p-3 border ${
              server.enabled
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-zinc-800/50 border-zinc-700'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full ${
                server.enabled ? 'bg-emerald-400' : 'bg-zinc-500'
              }`}></span>
              <span className={`font-medium text-sm ${
                server.enabled ? 'text-emerald-300' : 'text-zinc-400'
              }`}>
                {server.name}
              </span>
            </div>
            <div className="text-xs text-zinc-500">
              {server.type === 'remote' ? '🌐 Remote' : '💻 Local'}
            </div>
          </div>
        ))}
      </div>

      <div className="text-xs text-zinc-500">
        MCP servers configured in <code className="bg-zinc-800 px-1 rounded">opencode-config/opencode.json</code>
      </div>
    </div>
  );
}
