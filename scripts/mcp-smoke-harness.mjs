#!/usr/bin/env node

import { readFileSync } from 'fs';
import path from 'path';
import { homedir } from 'os';
import { resolveRoot } from './resolve-root.mjs';

const root = resolveRoot();
const HOME = process.env.USERPROFILE || process.env.HOME || homedir();
const outputJson = process.argv.includes('--json');
const recentDaysArgIndex = process.argv.indexOf('--days');
const recentDays = recentDaysArgIndex >= 0 ? Number(process.argv[recentDaysArgIndex + 1]) || 7 : 7;

const MCP_TOOL_PREFIXES = {
  supermemory: ['supermemory', 'supermemory_'],
  context7: ['context7_'],
  playwright: ['playwright'],
  sequentialthinking: ['sequentialthinking_'],
  websearch: ['websearch_'],
  grep: ['grep_', 'grepapp', 'grep_app_'],
  distill: ['distill', 'distill_'],
  'opencode-context-governor': ['opencode_context_governor', 'context_governor'],
};

function readJson(filePath, fallback) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function getLiveMcps() {
  const config = readJson(path.join(root, 'opencode-config', 'opencode.json'), {});
  return Object.entries(config.mcp || {})
    .filter(([, value]) => value?.enabled === true)
    .map(([name, value]) => ({
      name,
      type: value?.url ? 'remote' : 'local',
    }));
}

function getInvocations() {
  const filePath = path.join(HOME, '.opencode', 'tool-usage', 'invocations.json');
  const data = readJson(filePath, { invocations: [] });
  return Array.isArray(data.invocations) ? data.invocations : [];
}

function matchesMcp(name, toolName) {
  const prefixes = MCP_TOOL_PREFIXES[name] || [name];
  const lowerTool = String(toolName || '').toLowerCase();
  return prefixes.some((prefix) => lowerTool.startsWith(prefix.toLowerCase()));
}

function buildEntries() {
  const invocations = getInvocations();
  const now = Date.now();
  const cutoff = now - (recentDays * 24 * 60 * 60 * 1000);

  return getLiveMcps().map((mcp) => {
    const matching = invocations
      .filter((entry) => matchesMcp(mcp.name, entry.tool))
      .sort((a, b) => new Date(String(b.timestamp || 0)).getTime() - new Date(String(a.timestamp || 0)).getTime());
    const lastInvocation = matching[0] || null;
    const lastTimestamp = lastInvocation?.timestamp ? new Date(lastInvocation.timestamp).getTime() : null;
    return {
      name: mcp.name,
      type: mcp.type,
      telemetryHits: matching.length,
      lastInvocation: lastInvocation?.timestamp || null,
      recentlyExercised: lastTimestamp !== null && lastTimestamp >= cutoff,
    };
  });
}

function printText(entries) {
  const exercisedCount = entries.filter((entry) => entry.recentlyExercised).length;
  console.log('# MCP Smoke Harness');
  console.log('');
  console.log(`Recent window: ${recentDays} day(s)`);
  console.log(`Live MCPs: ${entries.length}`);
  console.log(`Recently exercised: ${exercisedCount}`);
  console.log('');
  console.log('| MCP | Type | Telemetry Hits | Recently Exercised | Last Invocation |');
  console.log('|-----|------|----------------|-------------------|-----------------|');
  for (const entry of entries) {
    console.log(`| ${entry.name} | ${entry.type} | ${entry.telemetryHits} | ${entry.recentlyExercised ? 'yes' : 'no'} | ${entry.lastInvocation || 'never'} |`);
  }
}

function main() {
  const entries = buildEntries();
  const payload = {
    generatedAt: new Date().toISOString(),
    recentDays,
    liveMcpCount: entries.length,
    exercisedCount: entries.filter((entry) => entry.recentlyExercised).length,
    entries,
  };

  if (outputJson) {
    process.stdout.write(JSON.stringify(payload, null, 2));
  } else {
    printText(entries);
  }
}

main();
