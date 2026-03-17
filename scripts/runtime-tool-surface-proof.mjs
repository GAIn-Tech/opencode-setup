#!/usr/bin/env node

import { readFileSync } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';
import { resolveRoot } from './resolve-root.mjs';
import { createRequire } from 'module';
import { whichSync } from 'which';

const root = resolveRoot();
const require = createRequire(import.meta.url);
const DEFAULT_RUNTIME_MAP = 'C:/Users/jack/AppData/Local/Microsoft/WinGet/Packages/SST.opencode_Microsoft.Winget.Source_8wekyb3d8bbwe/index.js.map';

export function extractExperimentalToolQueryFields(sourceText) {
  let text = sourceText;
  if (text.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed.sourcesContent)) {
        text = parsed.sourcesContent.join('\n');
      }
    } catch {
      // fall through and treat input as raw source text
    }
  }

  const routeIndex = text.indexOf('operationId: "tool.list"');
  const searchStart = routeIndex >= 0 ? routeIndex : text.indexOf('validator(');
  if (searchStart === -1) return [];
  const window = text.slice(searchStart, searchStart + 1200);
  const queryBlock = window.match(/validator\(\s*"query",[\s\S]*?z\.object\(\{([\s\S]*?)\}\)/);
  if (!queryBlock) return [];
  const fieldMatches = [...queryBlock[1].matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*z\.string\(\)/g)];
  return fieldMatches.map((match) => match[1]);
}

export function compareRuntimeToolsToSelection({ runtimeToolIds, selectedToolNames }) {
  const aliasMap = {
    grep_grep_query: ['grep'],
    distill_browse_tools: ['compress'],
    distill_run_tool: ['compress'],
    prune: ['compress'],
    supermemory_search: ['supermemory'],
    supermemory_add: ['supermemory'],
    context7_resolve_library_id: ['skill_mcp'],
    context7_query_docs: ['skill_mcp'],
    'context7_resolve-library-id': ['skill_mcp'],
    writing_plans: ['todowrite'],
    'writing-plans': ['todowrite'],
  };

  const resolveCandidates = (name) => {
    const direct = [name];
    const alias = aliasMap[name] || [];
    return [...new Set([...direct, ...alias])];
  };

  const runtimeSet = new Set(runtimeToolIds);

  const presentSelectedTools = [];
  const missingSelectedTools = [];
  const resolvedToolMapping = {};

  for (const name of selectedToolNames) {
    const candidates = resolveCandidates(name);
    const resolved = candidates.find((candidate) => runtimeSet.has(candidate));
    if (resolved) {
      presentSelectedTools.push(name);
      resolvedToolMapping[name] = resolved;
      continue;
    }
    missingSelectedTools.push(name);
    resolvedToolMapping[name] = null;
  }

  return {
    presentSelectedTools,
    missingSelectedTools,
    resolvedToolMapping,
    allSelectedToolsVisible: missingSelectedTools.length === 0,
  };
}

function readInstalledRuntimeQueryFields(runtimeMapPath = DEFAULT_RUNTIME_MAP) {
  const raw = readFileSync(runtimeMapPath, 'utf8');
  return extractExperimentalToolQueryFields(raw);
}

function getPreloadSelection(prompt) {
  const { PreloadSkillsPlugin } = require(path.join(root, 'packages', 'opencode-plugin-preload-skills', 'src', 'index.js'));
  const plugin = new PreloadSkillsPlugin({
    logLevel: 'error',
    tiersConfigPath: path.join(root, 'opencode-config', 'tool-tiers.json'),
  });

  return plugin.selectTools({
    prompt,
    model: 'anthropic/claude-sonnet-4-5',
  }).tools.map((tool) => tool?.name || tool);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

/**
 * Check if a command exists before trying to spawn it
 * Prevents Bun segfaults from ENOENT
 * @param {string} command - Command or path to check
 * @returns {boolean} True if executable exists
 */
function commandExists(command) {
  // Guard against undefined/null/non-string command
  if (!command || typeof command !== "string") {
    return false;
  }
  // Check if it's a path
  if (command.includes('/') || command.includes('\\')) {
    return false; // We don't check file paths in this script
  }
  
  // Check if it's in PATH using which
  try {
    return !!whichSync(command);
  } catch {
    return false;
  }
}

async function withServer(port, fn) {
  // Check if opencode exists first to prevent ENOENT crash
  if (!commandExists('opencode')) {
    throw new Error('Command not found: opencode. Cannot start server.');
  }
  
  const child = spawn('opencode', ['serve', '--port', String(port)], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });

  try {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        await fetchJson(`http://127.0.0.1:${port}/experimental/tool/ids`);
        return await fn();
      } catch {
        await sleep(250);
      }
    }
    throw new Error('Timed out waiting for opencode serve');
  } finally {
    child.kill('SIGTERM');
  }
}

async function main() {
  const prompt = process.argv.slice(2).join(' ') || 'Use Context7 docs and Distill compression, then store the result in memory and reason step by step about the budget pressure';
  const port = 4317;
  const queryFields = readInstalledRuntimeQueryFields();
  const selectedToolNames = getPreloadSelection(prompt);

  const runtime = await withServer(port, async () => {
    const [toolIds, tools] = await Promise.all([
      fetchJson(`http://127.0.0.1:${port}/experimental/tool/ids`),
      fetchJson(`http://127.0.0.1:${port}/experimental/tool?provider=anthropic&model=claude-sonnet-4-5`),
    ]);
    return {
      toolIds,
      toolListIds: [...new Set(tools.map((tool) => tool.id))],
    };
  });

  const comparison = compareRuntimeToolsToSelection({
    runtimeToolIds: runtime.toolListIds,
    selectedToolNames,
  });

  process.stdout.write(JSON.stringify({
    prompt,
    experimentalToolQueryFields: queryFields,
    runtimeToolIdsCount: runtime.toolIds.length,
    runtimeVisibleToolCount: runtime.toolListIds.length,
    selectedToolNames,
    ...comparison,
  }, null, 2));
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
