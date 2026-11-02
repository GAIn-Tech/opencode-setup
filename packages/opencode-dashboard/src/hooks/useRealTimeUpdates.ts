'use client';

import { useEffect, useCallback, useRef, useState } from 'react';

export type EventType = 
  | 'workflow:update'
  | 'learning:update'
  | 'health:update'
  | 'config:update'
  | 'session:update'
  | 'connected'
  | 'heartbeat';

export interface SSEEvent {
  type: EventType;
  path?: string;
  timestamp: number;
  watchPaths?: Record<string, string>;
}

interface UseRealTimeUpdatesOptions {
  onWorkflowUpdate?: () => void;
  onLearningUpdate?: () => void;
  onHealthUpdate?: () => void;
  onConfigUpdate?: () => void;
  onSessionUpdate?: () => void;
  onAnyUpdate?: (event: SSEEvent) => void;
}

export function useRealTimeUpdates(options: UseRealTimeUpdatesOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Use refs for callbacks to avoid reconnection on every render
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const connect = useCallback(() => {
    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    try {
      const eventSource = new EventSource('/api/events');
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('[SSE] Connected');
        setIsConnected(true);
        setConnectionError(null);
      };

      eventSource.onmessage = (event) => {
        try {
          const data: SSEEvent = JSON.parse(event.data);
          setLastEvent(data);

          // Use ref to get current options without triggering reconnection
          const opts = optionsRef.current;
          
          // Call appropriate handler based on event type
          switch (data.type) {
            case 'connected':
              console.log('[SSE] Received connection confirmation');
              break;
            case 'heartbeat':
              // Heartbeat received, connection is healthy
              break;
            case 'workflow:update':
              console.log('[SSE] Workflow update detected');
              opts.onWorkflowUpdate?.();
              opts.onAnyUpdate?.(data);
              break;
            case 'learning:update':
              console.log('[SSE] Learning update detected');
              opts.onLearningUpdate?.();
              opts.onAnyUpdate?.(data);
              break;
            case 'health:update':
              console.log('[SSE] Health update detected');
              opts.onHealthUpdate?.();
              opts.onAnyUpdate?.(data);
              break;
            case 'config:update':
              console.log('[SSE] Config update detected');
              opts.onConfigUpdate?.();
              opts.onAnyUpdate?.(data);
              break;
            case 'session:update':
              console.log('[SSE] Session update detected');
              opts.onSessionUpdate?.();
              opts.onAnyUpdate?.(data);
              break;
            default:
              opts.onAnyUpdate?.(data);
          }
        } catch (error) {
          console.error('[SSE] Error parsing event:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('[SSE] Connection error:', error);
        setIsConnected(false);
        setConnectionError('Connection lost. Reconnecting...');
        
        eventSource.close();
        
        // Reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('[SSE] Attempting reconnect...');
          connect();
        }, 3000);
      };
    } catch (error) {
      console.error('[SSE] Failed to create EventSource:', error);
      setConnectionError('Failed to connect to real-time updates');
    }
  }, []); // Empty deps - connect is now stable

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    lastEvent,
    connectionError,
    reconnect: connect,
    disconnect,
  };
}

export default useRealTimeUpdates;
