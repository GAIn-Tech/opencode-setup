import { NextRequest } from 'next/server';
import { fileWatcher, WatchEvent } from '@/lib/file-watcher';

// Force dynamic rendering - SSE cannot be statically generated
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Store connected clients
const clients = new Set<ReadableStreamDefaultController>();

// Start file watcher on first request
let watcherStarted = false;

function startWatcher() {
  if (watcherStarted) return;
  
  watcherStarted = true;
  fileWatcher.start();
  
  fileWatcher.on('change', (event: WatchEvent) => {
    broadcastEvent(event);
  });
  
  console.log('[SSE] File watcher started, broadcasting to clients');
}

function broadcastEvent(event: WatchEvent) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  
  for (const controller of clients) {
    try {
      controller.enqueue(new TextEncoder().encode(data));
    } catch (error) {
      // Client disconnected, will be cleaned up
      clients.delete(controller);
    }
  }
}

// Send heartbeat every 30 seconds to keep connections alive
setInterval(() => {
  const heartbeat = `data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`;
  
  for (const controller of clients) {
    try {
      controller.enqueue(new TextEncoder().encode(heartbeat));
    } catch (error) {
      clients.delete(controller);
    }
  }
}, 30000);

export async function GET(request: NextRequest) {
  // Start watcher if not already started
  startWatcher();
  
  const stream = new ReadableStream({
    start(controller) {
      clients.add(controller);
      console.log(`[SSE] Client connected. Total clients: ${clients.size}`);
      
      // Send initial connection event
      const connectEvent = `data: ${JSON.stringify({ 
        type: 'connected', 
        timestamp: Date.now(),
        watchPaths: fileWatcher.getWatchPaths()
      })}\n\n`;
      controller.enqueue(new TextEncoder().encode(connectEvent));
    },
    cancel() {
      // Client will be removed from set when broadcast fails
      console.log(`[SSE] Client disconnected. Total clients: ${clients.size}`);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
