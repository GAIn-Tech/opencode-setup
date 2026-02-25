import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const DASHBOARD_DIR = path.join(ROOT, 'packages', 'opencode-dashboard', 'src', 'components', 'dashboard');

function readDashboardFile(name) {
  return fs.readFileSync(path.join(DASHBOARD_DIR, name), 'utf8');
}

describe('ConfigViewer modularization', () => {
  test('extracts section, editor, and search components', () => {
    const viewer = readDashboardFile('ConfigViewer.tsx');

    expect(fs.existsSync(path.join(DASHBOARD_DIR, 'ConfigSection.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(DASHBOARD_DIR, 'ConfigEditor.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(DASHBOARD_DIR, 'ConfigSearch.tsx'))).toBe(true);

    expect(viewer).toContain("from './ConfigSection'");
    expect(viewer).toContain("from './ConfigEditor'");
    expect(viewer).toContain("from './ConfigSearch'");
  });
});
