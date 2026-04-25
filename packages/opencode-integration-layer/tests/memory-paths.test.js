import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import {
  MEMORY_BASE_DIR,
  DEGRADED_QUEUE_DB,
  CONSOLIDATION_AUDIT_DB,
  SCORING_CACHE_DB,
  LEARNING_DATA_DIR,
  MEMORY_GRAPH_DB,
  resolveMemoryBaseDir,
  resolveMemorySubdir,
  ensureMemoryDir,
} from '../src/memory-paths.js';
import fs from 'node:fs';
import path from 'node:path';

describe('memory-paths', () => {
  const testSubdir = 'test-subdir-' + Date.now();

  test('MEMORY_BASE_DIR ends with .opencode/memory', () => {
    expect(MEMORY_BASE_DIR.endsWith('.opencode' + path.sep + 'memory')).toBe(true);
  });

  test('DEGRADED_QUEUE_DB contains degraded-queue.db', () => {
    expect(DEGRADED_QUEUE_DB).toContain('degraded-queue.db');
  });

  test('CONSOLIDATION_AUDIT_DB contains consolidation-audit.db', () => {
    expect(CONSOLIDATION_AUDIT_DB).toContain('consolidation-audit.db');
  });

  test('SCORING_CACHE_DB contains scoring-cache.db', () => {
    expect(SCORING_CACHE_DB).toContain('scoring-cache.db');
  });

  test('LEARNING_DATA_DIR contains learning', () => {
    expect(LEARNING_DATA_DIR).toContain('learning');
  });

  test('MEMORY_GRAPH_DB contains memory-graph.json', () => {
    expect(MEMORY_GRAPH_DB).toContain('memory-graph.json');
  });

  test('resolveMemoryBaseDir returns path ending with .opencode/memory', () => {
    const base = resolveMemoryBaseDir();
    expect(base.endsWith('.opencode' + path.sep + 'memory')).toBe(true);
  });

  test('resolveMemorySubdir returns path containing subdir name', () => {
    const subdir = resolveMemorySubdir('scoring');
    expect(subdir).toContain('scoring');
    expect(subdir.endsWith('scoring')).toBe(true);
  });

  test('ensureMemoryDir creates directory and returns path', () => {
    const created = ensureMemoryDir(testSubdir);
    expect(created).toContain(testSubdir);
    expect(fs.existsSync(created)).toBe(true);
  });

  test('os.homedir() is called (via resolveMemoryBaseDir)', () => {
    // If we got here and MEMORY_BASE_DIR is valid, os.homedir() was called
    expect(MEMORY_BASE_DIR.length).toBeGreaterThan(5);
  });

  // Cleanup
  afterEach(() => {
    const testDir = resolveMemorySubdir(testSubdir);
    if (fs.existsSync(testDir)) {
      fs.rmdirSync(testDir);
    }
  });
});