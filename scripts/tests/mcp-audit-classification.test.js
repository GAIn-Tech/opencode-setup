import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..', '..');

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(ROOT, relativePath), 'utf8'));
}

function readText(relativePath) {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

describe('MCP audit classification regression', () => {
  test('current canonical inventory matches post-activation classification', () => {
    const config = readJson('opencode-config/opencode.json');

    const live = ['context7', 'distill', 'supermemory', 'sequentialthinking', 'websearch', 'grep', 'playwright'];
    for (const name of live) {
      expect(config.mcp[name]?.enabled).toBe(true);
    }

    expect(config.mcp.github).toBeUndefined();
    expect(config.mcp.tavily).toBeUndefined();
  });

  test('activated MCPs have matching skill and agent surfaces', () => {
    const requiredPairs = [
      ['opencode-config/skills/supermemory/SKILL.md', 'opencode-config/agents/memory-keeper.md'],
      ['opencode-config/skills/sequentialthinking/SKILL.md', 'opencode-config/agents/thinker.md'],
      ['opencode-config/skills/websearch/SKILL.md', 'opencode-config/agents/researcher.md'],
      ['opencode-config/skills/grep/SKILL.md', 'opencode-config/agents/code-searcher.md'],
    ];

    for (const [skillPath, agentPath] of requiredPairs) {
      expect(existsSync(join(ROOT, skillPath))).toBe(true);
      expect(existsSync(join(ROOT, agentPath))).toBe(true);
    }
  });

  test('historical audit docs are marked as superseded', () => {
    const docs = [
      'opencode-config/supermemory/mcp-audit-20260308.md',
      'opencode-config/supermemory/mcp-audit-summary-20260308.md',
      'opencode-config/supermemory/mcp-wiring-plan-20260308.md',
    ];

    for (const relativePath of docs) {
      const content = readText(relativePath);
      expect(content).toContain('Superseded');
      expect(content).toContain('Mar 10, 2026');
    }
  });
});
