#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import path from 'path';
import { homedir } from 'os';
import { resolveRoot } from './resolve-root.mjs';

const root = resolveRoot();
const HOME = process.env.USERPROFILE || process.env.HOME || homedir();

const MCP_ALIASES = {
  playwright: {
    skillDirs: ['playwright', 'dev-browser', 'agent-browser'],
    agentHints: ['playwright browser', 'playwright', 'browser'],
    orchestratorHints: ['browser-testing', 'playwright', 'dev-browser', 'agent-browser'],
    directIntegrationHints: [],
  },
  distill: {
    skillDirs: ['distill', 'dcp', 'context-governor'],
    agentHints: ['distill'],
    orchestratorHints: ['distill', 'context compression', 'compress_urgent'],
  },
  'opencode-context-governor': {
    skillDirs: ['context-governor'],
    agentHints: ['context governor'],
    orchestratorHints: ['context-governor', 'budget-status', 'token budget'],
    directIntegrationHints: [
      'checkContextBudget(',
      'recordTokenUsage(',
      'getContextBudgetStatus(',
      'tokenBudgetManager.governor.getRemainingBudget(',
    ],
  },
  context7: {
    skillDirs: ['context7'],
    agentHints: ['context7'],
    orchestratorHints: ['context7'],
    directIntegrationHints: [],
  },
  supermemory: {
    skillDirs: ['supermemory'],
    agentHints: ['supermemory', 'memory'],
    orchestratorHints: ['supermemory', 'persistent memory'],
    directIntegrationHints: [],
  },
  sequentialthinking: {
    skillDirs: ['sequentialthinking'],
    agentHints: ['sequentialthinking', 'reasoning'],
    orchestratorHints: ['sequentialthinking', 'step by step'],
    directIntegrationHints: [],
  },
  websearch: {
    skillDirs: ['websearch'],
    agentHints: ['websearch', 'research'],
    orchestratorHints: ['websearch', 'search the web'],
    directIntegrationHints: [],
  },
  grep: {
    skillDirs: ['grep'],
    agentHints: ['grep', 'code-search'],
    orchestratorHints: ['grep', 'code example'],
    directIntegrationHints: [],
  },
};

function readJson(relativePath, fallback = {}) {
  try {
    return JSON.parse(readFileSync(path.join(root, relativePath), 'utf8'));
  } catch {
    return fallback;
  }
}

function readText(relativePath) {
  try {
    return readFileSync(path.join(root, relativePath), 'utf8');
  } catch {
    return '';
  }
}

function readTelemetryInvocations() {
  const filePath = path.join(HOME, '.opencode', 'tool-usage', 'invocations.json');
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf8'));
    return Array.isArray(data.invocations) ? data.invocations : [];
  } catch {
    return [];
  }
}

function collectRelativeFiles(basePath) {
  const absoluteBase = path.join(root, basePath);
  if (!existsSync(absoluteBase)) return [];

  const results = [];
  const stack = [absoluteBase];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readDirSafe(current)) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
      } else {
        results.push(path.relative(root, absolute).replace(/\\/g, '/'));
      }
    }
  }
  return results;
}

function readDirSafe(dirPath) {
  try {
    return readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function findToolMentions(text, toolPrefixes) {
  const found = new Set();
  for (const prefix of toolPrefixes) {
    if (text.includes(prefix)) found.add(prefix);
  }
  return [...found];
}

function buildMcpCatalog() {
  const opencode = readJson('opencode-config/opencode.json', {});
  const ohMy = readJson('opencode-config/oh-my-opencode.json', {});
  const registry = readJson('opencode-config/skills/registry.json', {});
  const invocations = readTelemetryInvocations();

  const skillFiles = collectRelativeFiles('opencode-config/skills');
  const agentFiles = collectRelativeFiles('opencode-config/agents');
  const orchestratorText = readText('opencode-config/skills/skill-orchestrator-runtime/SKILL.md');
  const directIntegrationCorpus = [
    readText('packages/opencode-integration-layer/src/index.js'),
    readText('packages/opencode-model-router-x/src/index.js'),
    readText('packages/opencode-integration-layer/src/context-bridge.js'),
  ].join('\n');
  const ohMyMcp = ohMy.mcp || {};
  const registrySkills = registry.skills || {};

  const serverEntries = Object.entries(opencode.mcp || {}).map(([name, config]) => {
    const alias = MCP_ALIASES[name] || { skillDirs: [name], agentHints: [name], orchestratorHints: [name] };
    const matchingSkillPaths = alias.skillDirs
      .map((skillDir) => `opencode-config/skills/${skillDir}/SKILL.md`)
      .filter((skillPath) => skillFiles.includes(skillPath));
    const skillExists = matchingSkillPaths.length > 0;
    const skillText = matchingSkillPaths.map((skillPath) => readText(skillPath)).join('\n');

    const telemetryHits = invocations.filter((entry) => String(entry.tool || '').startsWith(name)).length;
    const orchestratorLower = orchestratorText.toLowerCase();
    const orchestratorMention = alias.orchestratorHints.some((hint) => orchestratorLower.includes(hint.toLowerCase()));
    const directIntegrationMention = (alias.directIntegrationHints || []).some((hint) => directIntegrationCorpus.includes(hint));
    const ohMyEnabled = ohMyMcp[name]?.enabled === true;

    const matchingAgents = agentFiles.filter((agentPath) => {
      const content = readText(agentPath);
      const contentLower = content.toLowerCase();
      return alias.agentHints.some((hint) => contentLower.includes(hint.toLowerCase()));
    });

    const toolMentions = findToolMentions(skillText, [
      `${name}_`,
      `${name}{`,
      `${name} `,
      `${name}_search`,
      `${name}_query`,
      `${name}_run`,
      `${name}_capture`,
    ]);

    let status = config.enabled ? 'PASSIVE' : 'DEAD';
    const hasStrongWiring =
      (skillExists && (matchingAgents.length > 0 || orchestratorMention || ohMyEnabled)) ||
      (matchingAgents.length > 0 && orchestratorMention) ||
      (ohMyEnabled && orchestratorMention) ||
      directIntegrationMention;

    if (config.enabled && (telemetryHits > 0 || hasStrongWiring)) {
      status = 'LIVE';
    }

    return {
      name,
      enabled: config.enabled === true,
      status,
      type: config.url ? 'remote' : 'local',
      skillExists,
      matchingAgents,
      orchestratorMention,
      ohMyEnabled,
      telemetryHits,
      toolMentions,
      registryEntry: registrySkills[name] ? true : false,
      matchingSkillPaths,
      directIntegrationMention,
    };
  });

  return serverEntries;
}

function renderReport(entries) {
  const lines = [];
  lines.push('# MCP Lifecycle Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('| MCP | Status | Enabled | Type | Skill | Agent | Orchestrator | Telemetry |');
  lines.push('|-----|--------|---------|------|-------|-------|--------------|-----------|');

  for (const entry of entries) {
    lines.push(
      `| ${entry.name} | ${entry.status} | ${entry.enabled ? 'yes' : 'no'} | ${entry.type} | ${entry.skillExists ? 'yes' : 'no'} | ${entry.matchingAgents.length > 0 ? 'yes' : 'no'} | ${entry.orchestratorMention ? 'yes' : 'no'} | ${entry.telemetryHits} |`
    );
  }

  lines.push('');
  const heuristicNotes = [];

  for (const entry of entries) {
    lines.push(`## ${entry.name}`);
    lines.push(`- Status: ${entry.status}`);
    lines.push(`- Enabled: ${entry.enabled ? 'true' : 'false'}`);
    lines.push(`- Skill file: ${entry.skillExists ? 'present' : 'missing'}`);
    lines.push(`- Agents: ${entry.matchingAgents.length ? entry.matchingAgents.join(', ') : 'none'}`);
      lines.push(`- Orchestrator mention: ${entry.orchestratorMention ? 'yes' : 'no'}`);
      lines.push(`- Direct integration mention: ${entry.directIntegrationMention ? 'yes' : 'no'}`);
      lines.push(`- Telemetry hits: ${entry.telemetryHits}`);
      lines.push('');

    if (entry.enabled && entry.status !== 'DEAD') {
      if (!entry.skillExists && (entry.orchestratorMention || entry.matchingAgents.length > 0)) {
        heuristicNotes.push(`${entry.name}: classified via alias/indirect wiring because no direct MCP skill file exists.`);
      }
      if (entry.skillExists && !entry.orchestratorMention && !entry.directIntegrationMention && entry.matchingAgents.length === 0 && entry.telemetryHits === 0) {
        heuristicNotes.push(`${entry.name}: enabled and documented, but still lacks clear agent/orchestrator/runtime activity.`);
      }
    }
  }

  if (heuristicNotes.length > 0) {
    lines.push('## Heuristic Notes');
    for (const note of heuristicNotes) {
      lines.push(`- ${note}`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function writeReport(markdown) {
  const reportsDir = path.join(root, '.sisyphus', 'reports');
  mkdirSync(reportsDir, { recursive: true });
  const fileName = `mcp-lifecycle-${new Date().toISOString().slice(0, 10)}.md`;
  const reportPath = path.join(reportsDir, fileName);
  writeFileSync(reportPath, markdown, 'utf8');
  return reportPath;
}

function main() {
  const entries = buildMcpCatalog();
  const markdown = renderReport(entries);
  const reportPath = writeReport(markdown);
  process.stdout.write(markdown);
  process.stderr.write(`report-mcp-lifecycle: wrote ${reportPath}\n`);
}

main();
