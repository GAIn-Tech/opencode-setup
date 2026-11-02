import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

describe('GET /api/meta-kb', () => {
  let originalCwd: string;
  let tempRoot: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempRoot = mkdtempSync(path.join(tmpdir(), 'meta-kb-route-'));

    const dashboardDir = path.join(tempRoot, 'packages', 'opencode-dashboard');
    const indexDir = path.join(tempRoot, 'opencode-config');
    const proposalsDir = path.join(tempRoot, '.sisyphus', 'proposals');

    mkdirSync(dashboardDir, { recursive: true });
    mkdirSync(indexDir, { recursive: true });
    mkdirSync(proposalsDir, { recursive: true });

    const generatedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    writeFileSync(
      path.join(indexDir, 'meta-knowledge-index.json'),
      JSON.stringify(
        {
          generated_at: generatedAt,
          total_records: 3,
          by_category: {
            configuration: [{ id: 1 }],
            testing: [{ id: 2 }, { id: 3 }],
          },
          by_risk_level: {
            low: [{ id: 1 }, { id: 2 }],
            high: [{ id: 3 }],
          },
        },
        null,
        2,
      ),
      'utf-8',
    );

    writeFileSync(path.join(proposalsDir, 'agents-drift-report-2026-03-20.md'), '# report', 'utf-8');
    writeFileSync(
      path.join(proposalsDir, 'agents-drift-report-2026-03-20-2026-03-20T06-31-58-434Z.md'),
      '# timestamped report',
      'utf-8',
    );

    process.chdir(dashboardDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempRoot, { recursive: true, force: true });
  });

  test('returns meta-kb health summary with stale warning and drift status', async () => {
    const route = await import('../src/app/api/meta-kb/route');
    const response = await route.GET();
    const data = await response.json();

    expect(data).toHaveProperty('generated_at');
    expect(data).toHaveProperty('age_hours');
    expect(data).toHaveProperty('is_stale', true);
    expect(data).toHaveProperty('total_records', 3);
    expect(data).toHaveProperty('by_category.configuration', 1);
    expect(data).toHaveProperty('by_category.testing', 2);
    expect(data).toHaveProperty('by_risk_level.low', 2);
    expect(data).toHaveProperty('by_risk_level.high', 1);
    expect(data).toHaveProperty('drift_status.has_drift', true);
    expect(data).toHaveProperty(
      'drift_status.report_path',
      '.sisyphus/proposals/agents-drift-report-2026-03-20-2026-03-20T06-31-58-434Z.md',
    );
    expect(data).toHaveProperty('staleness_warning');
  });
});
