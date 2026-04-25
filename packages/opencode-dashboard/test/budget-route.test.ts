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

    const governorDir = join(tempHome, '.opencode');
    mkdirSync(governorDir, { recursive: true });

    writeFileSync(join(governorDir, 'session-budgets.json'), JSON.stringify({
      sessions: {
        'session-a': { 'openai/gpt-5': 50000 },
        'session-b': { 'openai/gpt-5': 170000 }
      },
      savedAt: '2026-03-10T00:01:00.000Z'
    }, null, 2));
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    process.env.USERPROFILE = originalUserProfile;
    rmSync(tempHome, { recursive: true, force: true });
  });

    it('returns aggregated session budget summaries with remediation guidance', async () => {
    const route = await import('../src/app/api/budget/route');
    const response = await route.GET();
    const data = await response.json();

    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(2);
    expect(data[0]).toHaveProperty('sessionId');
      expect(data[0]).toHaveProperty('used');
      expect(data[0]).toHaveProperty('remaining');
      expect(data[0]).toHaveProperty('max');
      expect(data[0]).toHaveProperty('pct');
      expect(data[0]).toHaveProperty('status');
      expect(data[0]).toHaveProperty('remediation');
      expect(data[0].remediation).toHaveProperty('action');
      expect(data[0].remediation).toHaveProperty('must_compress');
      expect(data[0].remediation).toHaveProperty('must_block');
      expect(data[0].remediation).toHaveProperty('grace_period_ms');
      expect(data[0].remediation).toHaveProperty('next_step');
    });
});
