'use client';

import { useState, useEffect } from 'react';
import { X, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { LifecycleState } from './LifecycleBadge';
import { LifecycleBadge } from './LifecycleBadge';

interface StateTransitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  modelId: string;
  currentState: LifecycleState;
  onTransitionComplete?: () => void;
}

interface TransitionOption {
  toState: LifecycleState;
  label: string;
  description: string;
}

const TRANSITION_MAP: Record<LifecycleState, TransitionOption[]> = {
  detected: [
    {
      toState: 'assessed',
      label: 'Mark as Assessed',
      description: 'Benchmarks and quality metrics have been collected',
    },
  ],
  assessed: [
    {
      toState: 'approved',
      label: 'Approve for Use',
      description: 'Model is approved and ready for catalog',
    },
    {
      toState: 'detected',
      label: 'Rollback to Detected',
      description: 'Assessment failed or needs to be redone',
    },
  ],
  approved: [
    {
      toState: 'selectable',
      label: 'Make Selectable',
      description: 'Add to catalog and make available in UI',
    },
    {
      toState: 'assessed',
      label: 'Revoke Approval',
      description: 'Remove approval status',
    },
  ],
  selectable: [
    {
      toState: 'default',
      label: 'Promote to Default',
      description: 'Use as default model for category/intent',
    },
    {
      toState: 'approved',
      label: 'Remove from Catalog',
      description: 'Remove from selectable models',
    },
  ],
  default: [
    {
      toState: 'selectable',
      label: 'Demote from Default',
      description: 'Remove default status but keep selectable',
    },
  ],
};

export function StateTransitionModal({
  isOpen,
  onClose,
  modelId,
  currentState,
  onTransitionComplete,
}: StateTransitionModalProps) {
  const [selectedTransition, setSelectedTransition] = useState<LifecycleState | null>(null);
  const [actor, setActor] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const transitions = TRANSITION_MAP[currentState] || [];

  useEffect(() => {
    if (!isOpen) {
      // Reset form when modal closes
      setSelectedTransition(null);
      setActor('');
      setReason('');
      setError(null);
      setSuccess(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTransition) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/models/transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId,
          toState: selectedTransition,
          actor: actor || 'dashboard-user',
          reason: reason || 'Manual transition via dashboard',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Transition failed' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      setSuccess(true);
      setTimeout(() => {
        onTransitionComplete?.();
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to transition state');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-6 bg-gray-900 border-b border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-white">Manage Lifecycle State</h2>
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
        <div className="p-6 space-y-6">
          {/* Current State */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Current State</label>
            <LifecycleBadge state={currentState} />
          </div>

          {/* Success Message */}
          {success && (
            <div className="flex items-center gap-2 p-4 bg-green-900/30 border border-green-500/40 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <span className="text-sm text-green-300">Transition successful! Refreshing...</span>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-4 bg-red-900/30 border border-red-500/40 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <span className="text-sm text-red-300">{error}</span>
            </div>
          )}

          {/* Transition Options */}
          {!success && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  Select Transition
                </label>
                <div className="space-y-2">
                  {transitions.map((transition) => (
                    <button
                      key={transition.toState}
                      type="button"
                      onClick={() => setSelectedTransition(transition.toState)}
                      className={`
                        w-full p-4 text-left rounded-lg border transition-all
                        ${
                          selectedTransition === transition.toState
                            ? 'bg-blue-900/30 border-blue-500/60 ring-2 ring-blue-500/40'
                            : 'bg-gray-800/50 border-gray-700 hover:border-gray-600 hover:bg-gray-800'
                        }
                      `}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <LifecycleBadge state={currentState} />
                          <ArrowRight className="w-4 h-4 text-gray-500" />
                          <LifecycleBadge state={transition.toState} />
                        </div>
                      </div>
                      <div className="mt-2">
                        <p className="text-sm font-medium text-white">{transition.label}</p>
                        <p className="mt-1 text-xs text-gray-400">{transition.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Actor Input */}
              <div>
                <label htmlFor="actor" className="block text-sm font-medium text-gray-300 mb-2">
                  Actor (optional)
                </label>
                <input
                  id="actor"
                  type="text"
                  value={actor}
                  onChange={(e) => setActor(e.target.value)}
                  placeholder="e.g., admin@example.com"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60"
                />
              </div>

              {/* Reason Input */}
              <div>
                <label htmlFor="reason" className="block text-sm font-medium text-gray-300 mb-2">
                  Reason (optional)
                </label>
                <textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g., Approved after successful benchmarks"
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-700">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedTransition || isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  {isSubmitting ? 'Transitioning...' : 'Confirm Transition'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
