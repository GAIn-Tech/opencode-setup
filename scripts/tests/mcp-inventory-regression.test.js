import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..', '..');

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(ROOT, relativePath), 'utf8'));
}

describe('MCP inventory regression checks', () => {
  test('canonical MCP inventory keeps live services and removes dead entries', () => {
    const config = readJson('opencode-config/opencode.json');

    expect(config.mcp.supermemory?.enabled).toBe(true);
    expect(config.mcp.context7?.enabled).toBe(true);
    expect(config.mcp.playwright?.enabled).toBe(true);
    expect(config.mcp.sequentialthinking?.enabled).toBe(true);
    expect(config.mcp.websearch?.enabled).toBe(true);
    expect(config.mcp.grep?.enabled).toBe(true);
    expect(config.mcp.distill?.enabled).toBe(true);

    expect(config.mcp.github).toBeUndefined();
    expect(config.mcp.tavily).toBeUndefined();
  });

  test('compound skill registry keeps passive MCP skills enabled', () => {
    const compound = readJson('opencode-config/compound-engineering.json');
    const enabled = new Set(compound.skills.enabled);

    expect(enabled.has('supermemory')).toBe(true);
    expect(enabled.has('sequentialthinking')).toBe(true);
    expect(enabled.has('websearch')).toBe(true);
    expect(enabled.has('grep')).toBe(true);
    expect(enabled.has('dcp')).toBe(true);
    expect(enabled.has('agent-browser')).toBe(true);
  });

  test('required MCP skill and agent files exist on disk', () => {
    const requiredPaths = [
      'opencode-config/skills/supermemory/SKILL.md',
      'opencode-config/skills/sequentialthinking/SKILL.md',
      'opencode-config/skills/websearch/SKILL.md',
      'opencode-config/skills/grep/SKILL.md',
      'opencode-config/skills/task-orchestrator/SKILL.md',
      'opencode-config/agents/memory-keeper.md',
      'opencode-config/agents/thinker.md',
      'opencode-config/agents/researcher.md',
      'opencode-config/agents/code-searcher.md',
    ];

    for (const relativePath of requiredPaths) {
      expect(existsSync(join(ROOT, relativePath))).toBe(true);
    }
  });
});
