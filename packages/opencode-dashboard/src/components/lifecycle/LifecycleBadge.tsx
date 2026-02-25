'use client';

import { useMemo } from 'react';

export type LifecycleState = 'detected' | 'assessed' | 'approved' | 'selectable' | 'default';

interface LifecycleBadgeProps {
  state: LifecycleState;
  onClick?: () => void;
  className?: string;
}

const STATE_CONFIG: Record<LifecycleState, { label: string; bg: string; text: string; border: string }> = {
  detected: {
    label: 'Detected',
    bg: 'bg-gray-900/50',
    text: 'text-gray-300',
    border: 'border-gray-500/40',
  },
  assessed: {
    label: 'Assessed',
    bg: 'bg-blue-900/50',
    text: 'text-blue-300',
    border: 'border-blue-500/40',
  },
  approved: {
    label: 'Approved',
    bg: 'bg-green-900/50',
    text: 'text-green-300',
    border: 'border-green-500/40',
  },
  selectable: {
    label: 'Selectable',
    bg: 'bg-teal-900/50',
    text: 'text-teal-300',
    border: 'border-teal-500/40',
  },
  default: {
    label: 'Default',
    bg: 'bg-purple-900/50',
    text: 'text-purple-300',
    border: 'border-purple-500/40',
  },
};

export function LifecycleBadge({ state, onClick, className = '' }: LifecycleBadgeProps) {
  const config = useMemo(() => STATE_CONFIG[state] || STATE_CONFIG.detected, [state]);

  const baseClasses = `
    inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium
    border transition-all duration-200
    ${config.bg} ${config.text} ${config.border}
  `;

  const interactiveClasses = onClick
    ? 'cursor-pointer hover:brightness-125 hover:scale-105 active:scale-95'
    : '';

  return (
    <span
      className={`${baseClasses} ${interactiveClasses} ${className}`.trim()}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      aria-label={`Lifecycle state: ${config.label}${onClick ? ' (click to manage)' : ''}`}
    >
      <span className="relative flex h-2 w-2">
        <span
          className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${config.bg}`}
        />
        <span className={`relative inline-flex rounded-full h-2 w-2 ${config.bg.replace('/50', '')}`} />
      </span>
      {config.label}
    </span>
  );
}
