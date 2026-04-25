import os from 'node:os';
import path from 'node:path';

/**
 * Platform-aware path resolution for memory subsystems.
 * All paths are relative to os.homedir() for cross-platform compatibility.
 */

// Resolve the base memory directory: ~/.opencode/memory/
function resolveMemoryBaseDir() {
  const home = os.homedir();
  if (!home || home.length < 2) {
    throw new Error(`[memory-paths] os.homedir() returned invalid path: ${home}`);
  }
  return path.join(home, '.opencode', 'memory');
}

// Resolve a subdirectory under the memory base dir
function resolveMemorySubdir(name) {
  return path.join(resolveMemoryBaseDir(), name);
}

// Ensure a memory subdirectory exists (recursive)
function ensureMemoryDir(name) {
  const dirPath = resolveMemorySubdir(name);
  const { existsSync, mkdirSync } = require('node:fs');
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

// --- Path Constants ---

/** Base memory directory: ~/.opencode/memory/ */
export const MEMORY_BASE_DIR = resolveMemoryBaseDir();

/** Degraded mode queue SQLite database: ~/.opencode/memory/degraded-queue.db */
export const DEGRADED_QUEUE_DB = path.join(MEMORY_BASE_DIR, 'degraded-queue.db');

/** Consolidation audit trail SQLite database: ~/.opencode/memory/consolidation-audit.db */
export const CONSOLIDATION_AUDIT_DB = path.join(MEMORY_BASE_DIR, 'consolidation-audit.db');

/** Scoring cache SQLite database: ~/.opencode/memory/scoring-cache.db */
export const SCORING_CACHE_DB = path.join(MEMORY_BASE_DIR, 'scoring-cache.db');

/** Learning engine data directory: ~/.opencode/memory/learning/ */
export const LEARNING_DATA_DIR = resolveMemorySubdir('learning');

/** Memory graph data file: ~/.opencode/memory/memory-graph.json */
export const MEMORY_GRAPH_DB = path.join(MEMORY_BASE_DIR, 'memory-graph.json');

// --- Exports ---

export {
  resolveMemoryBaseDir,
  resolveMemorySubdir,
  ensureMemoryDir,
};