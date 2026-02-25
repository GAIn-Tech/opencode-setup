import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const DASHBOARD_DIR = path.join(ROOT, 'packages', 'opencode-dashboard', 'src', 'components', 'dashboard');

function readDashboardFile(name) {
  return fs.readFileSync(path.join(DASHBOARD_DIR, name), 'utf8');
}

describe('InteractiveKnowledgeGraph modularization', () => {
  test('extracts canvas, controls, and tooltip modules', () => {
    const graph = readDashboardFile('InteractiveKnowledgeGraph.tsx');

    expect(fs.existsSync(path.join(DASHBOARD_DIR, 'GraphCanvas.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(DASHBOARD_DIR, 'GraphControls.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(DASHBOARD_DIR, 'GraphTooltip.tsx'))).toBe(true);

    expect(graph).toContain("from './GraphCanvas'");
    expect(graph).toContain("from './GraphControls'");
    expect(graph).toContain("from './GraphTooltip'");
  });
});
