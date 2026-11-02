import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { analyzeAgentsFile, parseStructureDirectories } from '../check-agents-drift.mjs';

const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('check-agents-drift STRUCTURE nesting', () => {
  test('preserves nested tree context under declared root', () => {
    const content = `
## STRUCTURE


\`\`\`
src/
├── app/
│   └── api/
├── components/
│   └── lifecycle/
└── lib/
    └── data-sources/
.next/
\`\`\`
`;

    const parsed = parseStructureDirectories(content, path.join('packages', 'opencode-dashboard'));
    const entries = parsed.map((entry) => entry.entry);

    expect(entries).toContain('src');
    expect(entries).toContain('src/app');
    expect(entries).toContain('src/app/api');
    expect(entries).toContain('src/components');
    expect(entries).toContain('src/components/lifecycle');
    expect(entries).toContain('src/lib');
    expect(entries).toContain('src/lib/data-sources');
    expect(entries).toContain('.next');
    expect(entries).not.toContain('app');
    expect(entries).not.toContain('components/lifecycle');
  });

  test('does not report false missing directories when nested paths exist', () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), 'agents-drift-'));
    tempDirs.push(tempRoot);

    const packageDir = path.join(tempRoot, 'packages', 'example-dashboard');
    mkdirSync(path.join(packageDir, 'src', 'app', 'api'), { recursive: true });
    mkdirSync(path.join(packageDir, 'src', 'lib'), { recursive: true });

    const agentsPath = path.join(packageDir, 'AGENTS.md');
    writeFileSync(agentsPath, `
## STRUCTURE

\`\`\`
src/
├── app/
│   └── api/
└── lib/
\`\`\`
`, 'utf8');

    const result = analyzeAgentsFile(agentsPath);

    expect(result.directoryDrifts).toHaveLength(0);
    expect(result.countDrifts).toHaveLength(0);
    expect(result.commandDrifts).toHaveLength(0);
  });

  test('keeps root-level directories outside nested root', () => {
    const content = `
## STRUCTURE

\`\`\`
src/
├── adapters/
└── cache/
test/
\`\`\`
`;

    const parsed = parseStructureDirectories(content, path.join('packages', 'opencode-model-manager'));
    const entries = parsed.map((entry) => entry.entry);

    expect(entries).toContain('src/adapters');
    expect(entries).toContain('src/cache');
    expect(entries).toContain('test');
    expect(entries).not.toContain('adapters');
  });
});
