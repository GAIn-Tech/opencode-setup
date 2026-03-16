import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..', '..');
const API_DIR = join(ROOT, 'packages', 'opencode-dashboard', 'src', 'app', 'api');

/**
 * Explicit allowlist of every POST route in the dashboard.
 * Adding a new POST endpoint requires updating this list — ensuring
 * the author consciously decides which RBAC permission to assign.
 */
const EXPECTED_POST_ROUTES = [
  '/api/config',
  '/api/models',
  '/api/models/transition',
  '/api/monitoring',
  '/api/orchestration',
  '/api/orchestration/policy-sim',
  '/api/plugin-supervisor',
  '/api/providers',
  '/api/skills/promotions',
  '/api/status/usage',
];

/**
 * Recursively find all route.ts files under a directory.
 */
function findRouteFiles(dir) {
  const results = [];
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

/**
 * Convert an absolute route.ts path to a route name like /api/config.
 */
function toRouteName(filePath) {
  return filePath
    .replace(/\\/g, '/')
    .replace(/.*\/api\//, '/api/')
    .replace(/\/route\.ts$/, '');
}

describe('Dashboard POST auth coverage', () => {
  const routeFiles = findRouteFiles(API_DIR);
  const postRoutes = [];
  const routeContents = new Map();

  for (const filePath of routeFiles) {
    const content = readFileSync(filePath, 'utf-8');
    if (/export\s+(async\s+)?function\s+POST\b/.test(content)) {
      const name = toRouteName(filePath);
      postRoutes.push(name);
      routeContents.set(name, content);
    }
  }

  test('discovered POST routes match the explicit allowlist', () => {
    const sorted = [...postRoutes].sort();
    const expectedSorted = [...EXPECTED_POST_ROUTES].sort();
    expect(sorted).toEqual(expectedSorted);
  });

  test('every POST route calls requireWriteAccess with a specific permission', () => {
    const missingAuth = [];
    const missingPermission = [];

    for (const [route, content] of routeContents.entries()) {
      if (!content.includes('requireWriteAccess')) {
        missingAuth.push(route);
        continue;
      }

      // The comma after `request` proves a permission argument is present
      if (!/requireWriteAccess\(\s*request\s*,\s*['"][^'"]+['"]\s*\)/.test(content)) {
        missingPermission.push(route);
      }
    }

    expect(missingAuth).toEqual([]);
    expect(missingPermission).toEqual([]);
  });

  test('no POST route is missing from the allowlist (new route detection)', () => {
    const unexpected = postRoutes.filter((r) => !EXPECTED_POST_ROUTES.includes(r));
    expect(unexpected).toEqual([]);
  });

  test('no allowlisted route is missing from disk', () => {
    const missing = EXPECTED_POST_ROUTES.filter((r) => !postRoutes.includes(r));
    expect(missing).toEqual([]);
  });
});
