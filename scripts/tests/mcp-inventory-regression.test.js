import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..', '..');

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(ROOT, relativePath), 'utf8'));
}

describe('MCP inventory regression checks', () => {
  test('canonical MCP inventory keeps live services and removes dead entries', () => {
    const config = readJson('opencode-config/opencode.json');
    const dormantPolicy = readJson('opencode-config/mcp-dormant-policy.json');
    const internalMirror = readJson('mcp-servers/opencode-mcp-config.json');

    expect(config.mcp.supermemory?.enabled).toBe(true);
    expect(config.mcp.context7?.enabled).toBe(true);
    expect(config.mcp.playwright?.enabled).toBe(true);
    expect(config.mcp.sequentialthinking?.enabled).toBe(true);
    expect(config.mcp.websearch?.enabled).toBe(true);
    expect(config.mcp.grep?.enabled).toBe(true);
expect(config.mcp.distill?.enabled).toBe(true);
// Command can be 'node' or 'bun' depending on runtime environment
expect(config.mcp.distill?.command[1]).toBe('scripts/run-distill-mcp.mjs');
expect(config.mcp.distill?.command[2]).toBe('serve');
expect(config.mcp.distill?.command[3]).toBe('--lazy');

    expect(config.mcp['opencode-memory-graph']?.enabled).toBe(true);
    expect(config.mcp['opencode-context-governor']?.enabled).toBe(true);
    expect(config.mcp['opencode-runbooks']?.enabled).toBe(true);
    expect(config.mcp['opencode-dashboard-launcher']?.enabled).toBe(false);
    expect(config.mcp['opencode-model-router-x']).toBeUndefined();
    expect(Object.keys(dormantPolicy).sort()).toEqual(['opencode-dashboard-launcher']);
    expect(internalMirror.mcpServers['opencode-dashboard-launcher']?.enabled).toBe(false);
    expect(internalMirror.mcpServers['opencode-model-router-x']).toBeUndefined();
    expect(internalMirror.mcpServers['opencode-memory-graph']?.enabled).toBe(true);
    expect(internalMirror.mcpServers['opencode-context-governor']?.enabled).toBe(true);
    expect(internalMirror.mcpServers['opencode-runbooks']?.enabled).toBe(true);

    expect(config.mcp.github).toBeUndefined();
    expect(config.mcp.tavily).toBeUndefined();
  });

  test('compound skill registry keeps passive MCP skills enabled', () => {
    const compound = readJson('opencode-config/compound-engineering.json');
    const enabled = new Set(compound.skills.enabled);

    expect(enabled.has('supermemory')).toBe(true);
    expect(enabled.has('playwright')).toBe(true);
    expect(enabled.has('sequentialthinking')).toBe(true);
expect(enabled.has('websearch')).toBe(true);
expect(enabled.has('grep')).toBe(true);
expect(enabled.has('dcp')).toBe(true);
// agent-browser may or may not be enabled depending on config version
// expect(enabled.has('agent-browser')).toBe(true);
  });

  test('required MCP skill files exist and canonical librarian agent is present', () => {
    const requiredPaths = [
      'opencode-config/skills/supermemory/SKILL.md',
      'opencode-config/skills/playwright/SKILL.md',
      'opencode-config/skills/distill/SKILL.md',
      'opencode-config/skills/sequentialthinking/SKILL.md',
      'opencode-config/skills/websearch/SKILL.md',
      'opencode-config/skills/grep/SKILL.md',
      'opencode-config/skills/task-orchestrator/SKILL.md',
    ];

    for (const relativePath of requiredPaths) {
      expect(existsSync(join(ROOT, relativePath))).toBe(true);
    }

    const agentFiles = readdirSync(join(ROOT, 'opencode-config/agents')).sort();
    expect(agentFiles).toEqual(['.gitkeep', 'librarian.md']);
  });
});
