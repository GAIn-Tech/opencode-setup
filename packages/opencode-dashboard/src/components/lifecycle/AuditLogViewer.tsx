'use client';

import { useState, useEffect } from 'react';
import { X, Clock, User, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import { LifecycleBadge, type LifecycleState } from './LifecycleBadge';

interface AuditLogViewerProps {
  isOpen: boolean;
  onClose: () => void;
  modelId: string;
}

interface AuditEntry {
  id: number;
  modelId: string;
  fromState: LifecycleState;
  toState: LifecycleState;
  actor: string;
  reason: string;
  timestamp: number;
  diffHash: string;
}

export function AuditLogViewer({ isOpen, onClose, modelId }: AuditLogViewerProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    if (isOpen) {
      loadAuditLog();
    }
  }, [isOpen, modelId, limit]);

  const loadAuditLog = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/models/audit?modelId=${encodeURIComponent(modelId)}&limit=${limit}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setEntries(data.entries || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log');
      setEntries([]);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  };

  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return `${seconds}s ago`;
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden bg-gray-900 border border-gray-700 rounded-lg shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 bg-gray-900 border-b border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-white">Audit Log</h2>
            <p className="mt-1 text-sm text-gray-400">Model: {modelId}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <div className="flex items-center gap-2 p-4 bg-red-900/30 border border-red-500/40 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <span className="text-sm text-red-300">{error}</span>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && entries.length === 0 && (
            <div className="text-center py-12">
              <Clock className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No audit entries found for this model</p>
            </div>
          )}

          {/* Timeline */}
          {!isLoading && !error && entries.length > 0 && (
            <div className="relative">
              {/* Timeline Line */}
              <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-700" />

              {/* Entries */}
              <div className="space-y-6">
                {entries.map((entry, index) => (
                  <div key={entry.id} className="relative pl-14">
                    {/* Timeline Dot */}
                    <div className="absolute left-4 top-2 w-4 h-4 rounded-full bg-blue-500 border-4 border-gray-900 ring-2 ring-blue-500/30" />

                    {/* Entry Card */}
                    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 hover:border-gray-600 transition-colors">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex items-center gap-3">
                          <LifecycleBadge state={entry.fromState} />
                          <ArrowRight className="w-4 h-4 text-gray-500" />
                          <LifecycleBadge state={entry.toState} />
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-400">{formatRelativeTime(entry.timestamp)}</p>
                          <p className="text-xs text-gray-500">{formatTimestamp(entry.timestamp)}</p>
                        </div>
                      </div>

                      {/* Details */}
                      <div className="space-y-2">
                        {/* Actor */}
                        <div className="flex items-center gap-2 text-sm">
                          <User className="w-4 h-4 text-gray-500" />
                          <span className="text-gray-400">Actor:</span>
                          <span className="text-gray-300">{entry.actor}</span>
                        </div>

                        {/* Reason */}
                        {entry.reason && (
                          <div className="text-sm">
                            <span className="text-gray-400">Reason:</span>
                            <p className="mt-1 text-gray-300">{entry.reason}</p>
                          </div>
                        )}

                        {/* Diff Hash */}
                        {entry.diffHash && (
                          <div className="text-xs text-gray-500 font-mono">
                            Hash: {entry.diffHash.substring(0, 16)}...
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 bg-gray-900 border-t border-gray-700">
          <div className="text-sm text-gray-400">
            Showing {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLimit(50)}
              className={`px-3 py-1 text-sm rounded ${
                limit === 50
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              50
            </button>
            <button
              onClick={() => setLimit(100)}
              className={`px-3 py-1 text-sm rounded ${
                limit === 100
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              100
            </button>
            <button
              onClick={() => setLimit(200)}
              className={`px-3 py-1 text-sm rounded ${
                limit === 200
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              200
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
