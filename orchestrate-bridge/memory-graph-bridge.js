/**
 * Memory Graph Bridge
 * 
 * Reads orchestrate session logs and feeds them to memory-graph
 * for building the session → error relationship graph.
 * 
 * Uses streaming (createReadStream + readline) to avoid memory spikes
 * on large JSONL logs — processes line-by-line instead of loading
 * the entire file into memory.
 */

const fs = require('fs');
const { createReadStream } = require('fs');
const { createInterface } = require('readline');
const path = require('path');
const os = require('os');

// Try to import memory-graph, fallback to no-op if not available
let MemoryGraph;
try {
  MemoryGraph = require('@jackoatmon/opencode-memory-graph');
} catch (e) {
  console.log('[memory-graph-bridge] Memory graph not available, using no-op mode');
  MemoryGraph = null;
}

const LOG_DIR = path.join(os.homedir(), '.omc', 'logs');
const SESSION_LOG = path.join(LOG_DIR, 'orchestrate-sessions.jsonl');
const PROCESSED_MARKER = path.join(LOG_DIR, '.memory-graph-processed');

/**
 * Stream non-empty lines from a JSONL file starting at a byte offset.
 * Uses createReadStream + readline to avoid loading the entire file.
 *
 * @param {string} logPath - Path to the JSONL file
 * @param {number} [startPosition=0] - Byte offset to begin reading from
 * @yields {string} Individual non-empty lines
 */
async function* streamLogLines(logPath, startPosition = 0) {
  const streamOpts = { encoding: 'utf8' };
  if (startPosition > 0) {
    streamOpts.start = startPosition;
  }
  const fileStream = createReadStream(logPath, streamOpts);
  const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (line.trim()) yield line;
  }
}

/**
 * Process new log entries and send to memory graph.
 * Streams the JSONL file line-by-line to keep memory usage constant
 * regardless of log size.
 */
async function processLogs() {
  if (!MemoryGraph) {
    console.log('[memory-graph-bridge] MemoryGraph not available, skipping');
    return;
  }

  if (!fs.existsSync(SESSION_LOG)) {
    console.log('[memory-graph-bridge] No session log found');
    return;
  }

  // Read last processed byte position
  let lastPosition = 0;
  if (fs.existsSync(PROCESSED_MARKER)) {
    lastPosition = parseInt(fs.readFileSync(PROCESSED_MARKER, 'utf8')) || 0;
  }

  // Check if there's new content beyond last position
  const stats = fs.statSync(SESSION_LOG);
  if (stats.size <= lastPosition) {
    console.log('[memory-graph-bridge] No new entries to process');
    return;
  }

  // Initialize memory graph
  const graph = new MemoryGraph({
    storagePath: path.join(os.homedir(), '.omc', 'memory-graph', 'data.json')
  });

  // Stream and process each new entry
  let entryCount = 0;
  let errorCount = 0;
  for await (const line of streamLogLines(SESSION_LOG, lastPosition)) {
    try {
      const entry = JSON.parse(line);
      await processEntry(graph, entry);
      entryCount++;
    } catch (e) {
      errorCount++;
      console.error('[memory-graph-bridge] Failed to process entry:', e.message);
    }
  }

  if (entryCount === 0 && errorCount === 0) {
    console.log('[memory-graph-bridge] No new entries to process');
    return;
  }

  console.log(`[memory-graph-bridge] Processed ${entryCount} entries (${errorCount} errors)`);

  // Save graph
  await graph.save();

  // Update marker to current file size (byte position)
  fs.writeFileSync(PROCESSED_MARKER, String(stats.size));

  console.log('[memory-graph-bridge] Processing complete');
}

/**
 * Process a single log entry
 * @param {MemoryGraph} graph - The memory graph instance
 * @param {Object} entry - Log entry
 */
async function processEntry(graph, entry) {
  switch (entry.type) {
    case 'task_start':
      graph.addNode('task', {
        id: entry.task_hash,
        agent: entry.agent,
        model: entry.model,
        complexity: entry.complexity,
        preview: entry.prompt_preview,
        timestamp: entry.timestamp
      });
      break;

    case 'task_complete':
      graph.addNode('outcome', {
        task_id: entry.task_hash,
        success: entry.success,
        duration: entry.duration_ms,
        timestamp: entry.timestamp
      });
      
      // Link outcome to task
      if (entry.task_hash) {
        graph.addEdge('task', entry.task_hash, 'outcome', `${entry.task_hash}-outcome`, {
          relation: entry.success ? 'succeeded' : 'failed'
        });
      }
      break;

    case 'error':
      graph.addNode('error', {
        type: entry.error_type,
        message: entry.error_message,
        agent: entry.agent,
        context: entry.context,
        timestamp: entry.timestamp
      });
      
      // Link error to agent
      if (entry.agent) {
        graph.addEdge('agent', entry.agent, 'error', `${entry.agent}-${entry.timestamp}`, {
          relation: 'encountered'
        });
      }
      break;

    case 'model_routing':
      graph.addNode('routing', {
        from: entry.from_model,
        to: entry.to_model,
        reason: entry.reason,
        timestamp: entry.timestamp
      });
      break;
  }
}

// Run if called directly
if (require.main === module) {
  processLogs().catch(console.error);
}

module.exports = { processLogs, streamLogLines, processEntry };
