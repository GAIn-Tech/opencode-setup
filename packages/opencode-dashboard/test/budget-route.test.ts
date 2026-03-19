import { beforeEach, afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let tempHome: string;
let originalHome: string | undefined;
let originalUserProfile: string | undefined;

describe('GET /api/budget', () => {
  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'budget-route-'));
    originalHome = process.env.HOME;
    originalUserProfile = process.env.USERPROFILE;
    process.env.HOME = tempHome;
    process.env.USERPROFILE = tempHome;

    const sessionsDir = join(tempHome, '.opencode', 'tool-usage', 'sessions');
    mkdirSync(sessionsDir, { recursive: true });

    writeFileSync(join(sessionsDir, 'session-a-budget.json'), JSON.stringify({
      session_id: 'session-a',
      estimated_tokens: 50000,
      model_limit: 200000,
      last_updated: '2026-03-10T00:00:00.000Z'
    }, null, 2));

    writeFileSync(join(sessionsDir, 'session-b-budget.json'), JSON.stringify({
      session_id: 'session-b',
      estimated_tokens: 170000,
      model_limit: 200000,
      last_updated: '2026-03-10T00:01:00.000Z'
    }, null, 2));
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    process.env.USERPROFILE = originalUserProfile;
    rmSync(tempHome, { recursive: true, force: true });
  });

  it('returns aggregated session budget summaries', async () => {
    const route = await import('../src/app/api/budget/route');
    const response = await route.GET();
    const data = await response.json();

    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(2);
    expect(data[0]).toHaveProperty('sessionId');
    expect(data[0]).toHaveProperty('used');
    expect(data[0]).toHaveProperty('max');
    expect(data[0]).toHaveProperty('pct');
    expect(data[0]).toHaveProperty('status');
  });
});
