import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';

/**
 * Unit tests for the /api/meta-kb route logic.
 *
 * We cannot import the Next.js route directly (requires framework context),
 * so we test the core logic by exercising the same read-and-summarize pattern
 * the route uses.
 */

function computeAgeHours(generatedAt) {
  const now = Date.now();
  const generated = new Date(generatedAt).getTime();
  if (isNaN(generated)) return -1;
  return Math.round((now - generated) / (1000 * 60 * 60) * 10) / 10;
}

function buildSummary(indexPath) {
  if (!fsSync.existsSync(indexPath)) {
    return {
      status: 'missing',
      generated_at: null,
      age_hours: null,
      total_records: 0,
    };
  }
  const index = JSON.parse(fsSync.readFileSync(indexPath, 'utf-8'));
  const ageHours = index.generated_at ? computeAgeHours(index.generated_at) : null;
  const isStale = ageHours !== null && ageHours > 24;

  const riskCounts = {};
  for (const [level, entries] of Object.entries(index.by_risk_level || {})) {
    riskCounts[level] = Array.isArray(entries) ? entries.length : 0;
  }

  return {
    status: isStale ? 'stale' : 'healthy',
    generated_at: index.generated_at ?? null,
    age_hours: ageHours,
    total_records: index.total_records ?? 0,
    by_risk_level: riskCounts,
    category_count: Object.keys(index.by_category || {}).length,
    anti_pattern_count: Array.isArray(index.anti_patterns) ? index.anti_patterns.length : 0,
  };
}

describe('meta-kb route logic', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `meta-kb-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch { /* ignore cleanup errors */ }
  });

  test('returns missing status when index file does not exist', () => {
    const result = buildSummary(path.join(tempDir, 'nonexistent.json'));
    expect(result.status).toBe('missing');
    expect(result.generated_at).toBeNull();
    expect(result.total_records).toBe(0);
  });

  test('returns healthy status for recent index', async () => {
    const index = {
      generated_at: new Date().toISOString(),
      total_records: 165,
      by_category: { tooling: [], bugfix: [], refactoring: [] },
      by_risk_level: { low: new Array(130), medium: new Array(35) },
      anti_patterns: new Array(11),
    };
    const indexPath = path.join(tempDir, 'meta-knowledge-index.json');
    await fs.writeFile(indexPath, JSON.stringify(index));

    const result = buildSummary(indexPath);
    expect(result.status).toBe('healthy');
    expect(result.total_records).toBe(165);
    expect(result.category_count).toBe(3);
    expect(result.by_risk_level.low).toBe(130);
    expect(result.by_risk_level.medium).toBe(35);
    expect(result.anti_pattern_count).toBe(11);
    expect(result.age_hours).toBeLessThan(1);
  });

  test('returns stale status when index is older than 24 hours', async () => {
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const index = {
      generated_at: oldDate,
      total_records: 10,
      by_category: {},
      by_risk_level: {},
      anti_patterns: [],
    };
    const indexPath = path.join(tempDir, 'meta-knowledge-index.json');
    await fs.writeFile(indexPath, JSON.stringify(index));

    const result = buildSummary(indexPath);
    expect(result.status).toBe('stale');
    expect(result.age_hours).toBeGreaterThan(24);
  });

  test('handles index with missing optional fields gracefully', async () => {
    const index = { generated_at: new Date().toISOString(), total_records: 5 };
    const indexPath = path.join(tempDir, 'meta-knowledge-index.json');
    await fs.writeFile(indexPath, JSON.stringify(index));

    const result = buildSummary(indexPath);
    expect(result.status).toBe('healthy');
    expect(result.total_records).toBe(5);
    expect(result.category_count).toBe(0);
    expect(result.anti_pattern_count).toBe(0);
  });
});
