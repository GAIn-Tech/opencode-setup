'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('[GlobalError] Application error:', error);
    console.error('[GlobalError] Error digest:', error.digest);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100 p-8">
      <div className="max-w-2xl w-full bg-zinc-900 border border-red-500/50 rounded-lg p-8">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-4xl">⚠️</span>
          <h2 className="text-2xl font-bold text-red-400">Something went wrong!</h2>
        </div>
        
        <p className="text-zinc-400 mb-4">
          An unexpected error occurred in the application.
        </p>
        
        {process.env.NODE_ENV === 'development' && (
          <div className="bg-zinc-950 rounded p-4 mb-4 overflow-auto max-h-48">
            <p className="text-red-400 font-mono text-sm">{error.message}</p>
            {error.stack && (
              <pre className="text-zinc-500 text-xs mt-2 overflow-auto">
                {error.stack}
              </pre>
            )}
          </div>
        )}
        
        {error.digest && (
          <p className="text-zinc-500 text-sm mb-4">
            Error ID: {error.digest}
          </p>
        )}
        
        <div className="flex gap-4">
          <button
            onClick={() => reset()}
            className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
          >
            Try again
          </button>
          
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg font-medium transition-colors"
          >
            Reload page
          </button>
        </div>
      </div>
    </div>
  );
}
