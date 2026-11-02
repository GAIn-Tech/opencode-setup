#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import { homedir } from 'os';
import { resolveRoot } from './resolve-root.mjs';

const root = resolveRoot();
const args = process.argv.slice(2);
const outputJson = args.includes('--json');
const outputIndex = args.indexOf('--output');
const outputPath = outputIndex !== -1 && args[outputIndex + 1] ? args[outputIndex + 1] : null;
const recentDaysArgIndex = args.indexOf('--days');
const recentDays = recentDaysArgIndex >= 0 ? Number(args[recentDaysArgIndex + 1]) || 7 : 7;

// Cross-platform data home resolution (P06 fix)
const DATA_HOME = process.env.OPENCODE_DATA_HOME
  || (process.env.XDG_DATA_HOME ? path.join(process.env.XDG_DATA_HOME, 'opencode') : null)
  || path.join(process.env.USERPROFILE || process.env.HOME || homedir(), '.opencode');

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
  const filePath = path.join(DATA_HOME, 'tool-usage', 'invocations.json');
  const data = readJson(filePath, { invocations: [] });
  return Array.isArray(data.invocations) ? data.invocations : [];
}

function getExercises() {
  const filePath = path.join(DATA_HOME, 'tool-usage', 'mcp-exercises.json');
  const data = readJson(filePath, { entries: [] });
  return Array.isArray(data.entries) ? data.entries : [];
}

function getRecentExercise(entry, exercises, cutoff) {
  const matches = exercises
    .filter((exercise) => exercise?.name === entry.name)
    .sort((a, b) => new Date(String(b.verifiedAt || b.timestamp || 0)).getTime() - new Date(String(a.verifiedAt || a.timestamp || 0)).getTime());
  const latest = matches[0] || null;
  const latestTime = latest?.verifiedAt || latest?.timestamp || null;
  const recent = latestTime !== null && new Date(latestTime).getTime() >= cutoff;
  return { latest, recent };
}

function getLatestExercise(name, exercises) {
  const matches = exercises
    .filter((exercise) => exercise?.name === name)
    .sort((a, b) => new Date(String(b.verifiedAt || b.timestamp || 0)).getTime() - new Date(String(a.verifiedAt || a.timestamp || 0)).getTime());
  return matches[0] || null;
}

function matchesMcp(name, toolName) {
  const prefixes = MCP_TOOL_PREFIXES[name] || [name];
  const lowerTool = String(toolName || '').toLowerCase();
  return prefixes.some((prefix) => lowerTool.startsWith(prefix.toLowerCase()));
}

function buildEntries() {
  const invocations = getInvocations();
  const exercises = getExercises();
  const now = Date.now();
  const cutoff = now - (recentDays * 24 * 60 * 60 * 1000);
  const runId = PROOF_RUN_ID;
  const commitSha = PROOF_COMMIT_SHA;

  return getLiveMcps().map((mcp) => {
    const matching = invocations
      .filter((entry) => matchesMcp(mcp.name, entry.tool))
      .sort((a, b) => new Date(String(b.timestamp || 0)).getTime() - new Date(String(a.timestamp || 0)).getTime());
    const lastInvocation = matching[0] || null;
    const lastTimestamp = lastInvocation?.timestamp ? new Date(lastInvocation.timestamp).getTime() : null;
    const exercise = getRecentExercise(mcp, exercises, cutoff);
    const latestExercise = getLatestExercise(mcp.name, exercises);
    const sameRunAttested = Boolean(
      latestExercise
      && String(latestExercise.runId || '').trim() === runId
      && String(latestExercise.commitSha || '').trim() === commitSha
    );
    const smokeVerified = Boolean(exercise.latest);
    return {
      name: mcp.name,
      type: mcp.type,
      telemetryHits: matching.length,
      lastInvocation: lastInvocation?.timestamp || null,
      recentlyExercised: (lastTimestamp !== null && lastTimestamp >= cutoff) || exercise.recent,
      smokeVerified,
      attestation: {
        required: true,
        sameRun: sameRunAttested,
        runId,
        commitSha,
        attestedAt: latestExercise?.verifiedAt || latestExercise?.timestamp || null,
      },
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
  console.log('| MCP | Type | Telemetry Hits | Recently Exercised | Smoke Verified | Last Invocation |');
  console.log('|-----|------|----------------|-------------------|----------------|-----------------|');
  for (const entry of entries) {
    console.log(`| ${entry.name} | ${entry.type} | ${entry.telemetryHits} | ${entry.recentlyExercised ? 'yes' : 'no'} | ${entry.smokeVerified ? 'yes' : 'no'} | ${entry.lastInvocation || 'never'} |`);
  }
}

function main() {
  const entries = buildEntries();
  const runId = PROOF_RUN_ID;
  const commitSha = PROOF_COMMIT_SHA;
  const missingAttestations = entries
    .filter((entry) => !entry.attestation?.sameRun)
    .map((entry) => entry.name);
  const payload = {
    generatedAt: new Date().toISOString(),
    recentDays,
    liveMcpCount: entries.length,
    exercisedCount: entries.filter((entry) => entry.recentlyExercised).length,
    proofRunId: runId,
    proofCommitSha: commitSha,
    universalProof: {
      mode: 'deterministic-attestation',
      runId,
      commitSha,
      requiredCount: entries.length,
      attestedCount: entries.length - missingAttestations.length,
      missingAttestations,
      status: missingAttestations.length === 0 ? 'passed' : 'failed',
    },
    entries,
  };

  if (outputPath) {
    const dir = path.dirname(outputPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
    console.error(`[OK] MCP smoke proof written to ${outputPath}`);
  } else if (outputJson) {
    process.stdout.write(JSON.stringify(payload, null, 2));
  } else {
    printText(entries);
  }
}

main();
