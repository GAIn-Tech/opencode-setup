'use client';

import React from 'react';

interface AuditEvent {
  id: number;
  type: string;
  payload: any;
  timestamp: string;
}

export const EvidenceViewer: React.FC<{ events: AuditEvent[] }> = ({ events }) => {
  return (
    <div className="space-y-2">
      <h2 className="text-xl font-semibold mb-4 text-gray-800">Execution Timeline (Evidence)</h2>
      {events.length === 0 ? (
        <p className="text-gray-500 italic">No events recorded.</p>
      ) : (
        <div className="flow-root">
          <ul role="list" className="-mb-8">
            {events.map((event, eventIdx) => (
              <li key={event.id}>
                <div className="relative pb-8">
                  {eventIdx !== events.length - 1 ? (
                    <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true" />
                  ) : null}
                  <div className="relative flex space-x-3">
                    <div>
                      <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white
                        ${event.type.includes('fail') ? 'bg-red-500' : 
                          event.type.includes('complete') ? 'bg-green-500' : 
                          'bg-gray-400'}`}>
                        {/* Simple dot or icon could go here */}
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                      <div>
                        <p className="text-sm text-gray-500">
                          <span className="font-medium text-gray-900">{event.type}</span>
                          {' '}
                          <code className="text-xs bg-gray-100 px-1 rounded">{JSON.stringify(event.payload)}</code>
                        </p>
                      </div>
                      <div className="whitespace-nowrap text-right text-sm text-gray-500">
                        <time dateTime={event.timestamp}>{new Date(event.timestamp).toLocaleTimeString()}</time>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
