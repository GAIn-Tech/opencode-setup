import { afterEach, describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { POST as postConfig } from '../packages/opencode-dashboard/src/app/api/config/route';
import { POST as postModels } from '../packages/opencode-dashboard/src/app/api/models/route';
import { POST as postTransition } from '../packages/opencode-dashboard/src/app/api/models/transition/route';
import { POST as postSkillsPromotions } from '../packages/opencode-dashboard/src/app/api/skills/promotions/route';
import { POST as postStatusUsage } from '../packages/opencode-dashboard/src/app/api/status/usage/route';
import { POST as postProviders } from '../packages/opencode-dashboard/src/app/api/providers/route';
import { POST as postOrchestration } from '../packages/opencode-dashboard/src/app/api/orchestration/route';

const WRITE_TOKEN_ENV = 'OPENCODE_DASHBOARD_WRITE_TOKEN';
const ORIGINAL_TOKEN = process.env[WRITE_TOKEN_ENV];

function resetToken() {
  if (ORIGINAL_TOKEN === undefined) {
    delete process.env[WRITE_TOKEN_ENV];
    return;
  }
  process.env[WRITE_TOKEN_ENV] = ORIGINAL_TOKEN;
}

afterEach(() => {
  resetToken();
});

/**
 * Recursively find all route.ts files under a directory.
 */
function findRouteFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findRouteFiles(fullPath));
    } else if (entry.name === 'route.ts') {
      results.push(fullPath);
    }
  }
  return results;
}

describe('Dashboard mutable API write guard', () => {
  test('POST /api/models is disabled when write token env var is missing', async () => {
    delete process.env[WRITE_TOKEN_ENV];

    const request = new Request('http://localhost/api/models', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ policies: {} })
    });

    const response = await postModels(request);
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toBe('Write routes are disabled');
  });

  test('POST /api/models rejects invalid token', async () => {
    process.env[WRITE_TOKEN_ENV] = 'expected-token';

    const request = new Request('http://localhost/api/models', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-opencode-write-token': 'wrong-token'
      },
      body: JSON.stringify({ policies: {} })
    });

    const response = await postModels(request);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe('Unauthorized');
  });

  test('POST /api/config rejects missing token when writes enabled', async () => {
    process.env[WRITE_TOKEN_ENV] = 'expected-token';

    const request = new Request('http://localhost/api/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ configKey: 'centralConfig', data: {} })
    });

    const response = await postConfig(request);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe('Unauthorized');
  });

  test('POST /api/config proceeds past auth with valid token', async () => {
    process.env[WRITE_TOKEN_ENV] = 'expected-token';

    const request = new Request('http://localhost/api/config', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-opencode-write-token': 'expected-token'
      },
      body: JSON.stringify({ configKey: null, data: null })
    });

    const response = await postConfig(request);
    expect(response.status).toBe(400);
  });

  test('POST /api/models/transition rejects invalid token', async () => {
    process.env[WRITE_TOKEN_ENV] = 'expected-token';

    const request = new Request('http://localhost/api/models/transition', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-opencode-write-token': 'wrong-token'
      },
      body: JSON.stringify({
        modelId: 'test-model',
        toState: 'approved'
      })
    });

    const response = await postTransition(request);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe('Unauthorized');
  });

  test('POST /api/skills/promotions rejects invalid token', async () => {
    process.env[WRITE_TOKEN_ENV] = 'expected-token';

    const request = new Request('http://localhost/api/skills/promotions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-opencode-write-token': 'wrong-token'
      },
      body: JSON.stringify({ skill: 'test-skill', action: 'promote' })
    });

    const response = await postSkillsPromotions(request);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe('Unauthorized');
  });

  test('POST /api/status/usage rejects invalid token', async () => {
    process.env[WRITE_TOKEN_ENV] = 'expected-token';

    const request = new Request('http://localhost/api/status/usage', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-opencode-write-token': 'wrong-token'
      },
      body: JSON.stringify({ type: 'test', data: {} })
    });

    const response = await postStatusUsage(request);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe('Unauthorized');
  });

  test('POST /api/providers rejects invalid token', async () => {
    process.env[WRITE_TOKEN_ENV] = 'expected-token';

    const request = new Request('http://localhost/api/providers', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-opencode-write-token': 'wrong-token'
      },
      body: JSON.stringify({ action: 'test', provider: 'anthropic' })
    });

    const response = await postProviders(request);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe('Unauthorized');
  });

  test('POST /api/orchestration rejects invalid token', async () => {
    process.env[WRITE_TOKEN_ENV] = 'expected-token';

    const request = new Request('http://localhost/api/orchestration', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-opencode-write-token': 'wrong-token'
      },
      body: JSON.stringify({ events: [{ model: 'test', timestamp: new Date().toISOString() }] })
    });

    const response = await postOrchestration(request);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe('Unauthorized');
  });
});

describe('Dashboard auth coverage regression', () => {
  test('every route.ts with POST export calls requireWriteAccess with a permission', () => {
    const apiDir = join(__dirname, '..', 'packages', 'opencode-dashboard', 'src', 'app', 'api');
    const routeFiles = findRouteFiles(apiDir);
    const postRoutes: string[] = [];
    const missingAuth: string[] = [];
    const missingPermission: string[] = [];

    for (const filePath of routeFiles) {
      const content = readFileSync(filePath, 'utf-8');

      // Check if file exports a POST function
      if (!/export\s+(async\s+)?function\s+POST\b/.test(content)) {
        continue;
      }

      const relative = filePath.replace(/\\/g, '/').replace(/.*\/api\//, '/api/').replace(/\/route\.ts$/, '');
      postRoutes.push(relative);

      // Must call requireWriteAccess
      if (!content.includes('requireWriteAccess')) {
        missingAuth.push(relative);
        continue;
      }

      // Must pass a specific permission string (not just bare requireWriteAccess(request))
      // Match requireWriteAccess(request, 'some:permission') or requireWriteAccess(request, "some:permission")
      if (!/requireWriteAccess\(\s*request\s*,\s*['"][^'"]+['"]\s*\)/.test(content)) {
        missingPermission.push(relative);
      }
    }

    // Expect at least the 10 known POST endpoints
    expect(postRoutes.length).toBeGreaterThanOrEqual(10);

    // No POST endpoint should be missing auth
    expect(missingAuth).toEqual([]);

    // No POST endpoint should be missing a specific permission
    expect(missingPermission).toEqual([]);
  });
});
