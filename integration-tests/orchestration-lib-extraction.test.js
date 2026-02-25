import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const ORCH_DIR = path.join(ROOT, 'packages', 'opencode-dashboard', 'src', 'app', 'api', 'orchestration');

function readRouteFile() {
  return fs.readFileSync(path.join(ORCH_DIR, 'route.ts'), 'utf8');
}

describe('orchestration route modularization', () => {
  test('extracts policy, event store, and correlation modules', () => {
    const routeSource = readRouteFile();
    const libDir = path.join(ORCH_DIR, 'lib');

    expect(fs.existsSync(path.join(libDir, 'policy-engine.js'))).toBe(true);
    expect(fs.existsSync(path.join(libDir, 'event-store.js'))).toBe(true);
    expect(fs.existsSync(path.join(libDir, 'correlation.js'))).toBe(true);

    expect(routeSource).toContain("from './lib/policy-engine.js'");
    expect(routeSource).toContain("from './lib/event-store.js'");
    expect(routeSource).toContain("from './lib/correlation.js'");
  });
});
