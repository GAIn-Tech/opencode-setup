#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';
import { resolveRoot } from './resolve-root.mjs';
import { createRequire } from 'module';

const root = resolveRoot();
const require = createRequire(import.meta.url);
const DEFAULT_RUNTIME_PROOF_MODEL = process.env.OPENCODE_RUNTIME_PROOF_MODEL || 'openai/gpt-5.2';

function resolveCommitSha() {
  const envCommit = String(process.env.OPENCODE_PROOF_COMMIT_SHA || process.env.GITHUB_SHA || '').trim();
  if (envCommit) return envCommit;
  const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  if (git.status !== 0) return 'unknown';
  const sha = String(git.stdout || '').trim();
  return sha || 'unknown';
}

function resolveProofRunId() {
  const explicit = String(process.env.OPENCODE_PROOF_RUN_ID || process.env.GITHUB_RUN_ID || '').trim();
  return explicit || `local-${Date.now()}`;
}

const PROOF_RUN_ID = resolveProofRunId();
const PROOF_COMMIT_SHA = resolveCommitSha();

function commandLocation(command) {
  const locator = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(locator, [command], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  const firstLine = (result.stdout || '').split(/\r?\n/).find((line) => line.trim());
  return firstLine ? firstLine.trim() : null;
}

function resolveRuntimeMapPath() {
  const explicit = String(process.env.OPENCODE_RUNTIME_MAP_PATH || '').trim();
  if (explicit && existsSync(explicit)) {
    return explicit;
  }

  const candidates = [];

  if (process.platform === 'win32') {
    const wingetPackagesDir = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
    if (existsSync(wingetPackagesDir)) {
      for (const entry of readdirSync(wingetPackagesDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (!entry.name.startsWith('SST.opencode_')) continue;
        candidates.push(path.join(wingetPackagesDir, entry.name, 'index.js.map'));
      }
    }
  }

  const opencodeExecutable = commandLocation('opencode');
  if (opencodeExecutable) {
    const exeDir = path.dirname(opencodeExecutable);
    candidates.push(path.join(exeDir, 'index.js.map'));
    candidates.push(path.join(exeDir, '..', 'index.js.map'));
  }

  candidates.push(path.join(root, 'node_modules', 'opencode', 'index.js.map'));
  candidates.push(path.join(root, 'node_modules', '@sst', 'opencode', 'index.js.map'));

  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function parseModelRef(modelRef) {
  const value = String(modelRef || '').trim();
  if (!value) {
    return { provider: 'openai', model: 'gpt-5.2' };
  }
  if (!value.includes('/')) {
    return { provider: 'openai', model: value };
  }
  const [provider, ...rest] = value.split('/');
  return {
    provider: provider.trim(),
    model: rest.join('/').trim(),
  };
}

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

function readInstalledRuntimeQueryFields(runtimeMapPath = resolveRuntimeMapPath()) {
  if (!runtimeMapPath) {
    return [];
  }
  const raw = readFileSync(runtimeMapPath, 'utf8');
  return extractExperimentalToolQueryFields(raw);
}

function getPreloadSelection(prompt, model = DEFAULT_RUNTIME_PROOF_MODEL) {
  const { PreloadSkillsPlugin } = require(path.join(root, 'packages', 'opencode-plugin-preload-skills', 'src', 'index.js'));
  const plugin = new PreloadSkillsPlugin({
    logLevel: 'error',
    tiersConfigPath: path.join(root, 'opencode-config', 'tool-tiers.json'),
  });

  return plugin.selectTools({
    prompt,
    model,
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
  
  return Boolean(commandLocation(command));
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
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      sleep(2000),
    ]);
    if (child.exitCode === null) {
      child.kill('SIGKILL');
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf('--output');
  const outputPath = outputIndex !== -1 && args[outputIndex + 1] ? args[outputIndex + 1] : null;
  const prompt = args.filter(arg => arg !== '--output' && (!outputIndex || args.indexOf(arg) > outputIndex + 1 || args.indexOf(arg) < outputIndex)).join(' ') || 'Use Context7 docs and Distill compression, then store the result in memory and reason step by step about the budget pressure';
  const port = 4317;
  const modelRef = DEFAULT_RUNTIME_PROOF_MODEL;
  const { provider, model } = parseModelRef(modelRef);
  const queryFields = readInstalledRuntimeQueryFields();
  const selectedToolNames = getPreloadSelection(prompt, modelRef);

  const runtime = await withServer(port, async () => {
    const [toolIds, tools] = await Promise.all([
      fetchJson(`http://127.0.0.1:${port}/experimental/tool/ids`),
      fetchJson(`http://127.0.0.1:${port}/experimental/tool?provider=${encodeURIComponent(provider)}&model=${encodeURIComponent(model)}`),
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

  const result = {
    generatedAt: new Date().toISOString(),
    prompt,
    modelRef,
    proofRunId: PROOF_RUN_ID,
    proofCommitSha: PROOF_COMMIT_SHA,
    experimentalToolQueryFields: queryFields,
    runtimeToolIdsCount: runtime.toolIds.length,
    runtimeVisibleToolCount: runtime.toolListIds.length,
    selectedToolNames,
    ...comparison,
    universalProof: {
      mode: 'deterministic-attestation',
      runId: PROOF_RUN_ID,
      commitSha: PROOF_COMMIT_SHA,
      requiredCount: selectedToolNames.length,
      attestedCount: comparison.presentSelectedTools.length,
      missingAttestations: comparison.missingSelectedTools,
      status: comparison.allSelectedToolsVisible ? 'passed' : 'failed',
    },
  };

  const output = JSON.stringify(result, null, 2);

  if (outputPath) {
    const dir = path.dirname(outputPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(outputPath, output, 'utf8');
    console.error(`[OK] Runtime tool proof written to ${outputPath}`);
  } else {
    process.stdout.write(output);
  }
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
