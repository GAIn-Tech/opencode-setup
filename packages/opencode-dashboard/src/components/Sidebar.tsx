'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  name: string;
  href: string;
  icon: string;
  description: string;
}

const navigation: NavItem[] = [
  { name: 'Workflows', href: '/', icon: '⚡', description: 'Monitor workflow runs' },
  { name: 'Memory Graph', href: '/memory', icon: '🧠', description: 'Session-error relationships' },
  { name: 'Learning', href: '/learning', icon: '📊', description: 'Anti-patterns & insights' },
  { name: 'Models', href: '/models', icon: '🤖', description: 'Model routing & RL metrics' },
  { name: 'Config', href: '/config', icon: '⚙️', description: 'View all settings' },
  { name: 'Health', href: '/health', icon: '💚', description: 'Package & system status' },
  { name: 'Docs', href: '/docs', icon: '📚', description: 'Documentation browser' },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`${collapsed ? 'w-16' : 'w-64'} bg-zinc-900 border-r border-zinc-800 transition-all duration-200 flex flex-col`}>
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-white">OC</span>
            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">v2</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '→' : '←'}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== '/' && pathname.startsWith(item.href));
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                isActive 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
              }`}
              title={collapsed ? item.name : undefined}
            >
              <span className="text-lg">{item.icon}</span>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{item.name}</div>
                  <div className="text-xs text-zinc-500 truncate">{item.description}</div>
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-zinc-800">
        {!collapsed && (
          <div className="text-xs text-zinc-500">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <span>Real-time connected</span>
            </div>
            <div>OpenCode Dashboard</div>
          </div>
        )}
      </div>
    </aside>
  );
}
