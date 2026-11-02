#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveRoot, userConfigDir } from './resolve-root.mjs';

const CONVERGENCE_ARTIFACT_CLASSES = Object.freeze([
  'runtimeConfig',
  'lockfile',
  'generatedArtifacts',
]);

function readJson(filePath, fallback = null) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function ensureParent(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

function runCommandDefault(command, args, cwd) {
  return spawnSync(command, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
}

function sha256Text(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function normalizeRelativePath(rootDir, filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function buildArtifactClassHash(rootDir, files = []) {
  const entries = files
    .map((filePath) => {
      const exists = existsSync(filePath);
      return {
        path: normalizeRelativePath(rootDir, filePath),
        exists,
        sha256: exists ? sha256File(filePath) : null,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    entries,
    hash: sha256Text(JSON.stringify(entries)),
  };
}

function generateRunId(now = new Date()) {
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  return `sync-reconcile-${timestamp}-${process.pid}`;
}

function resolveCommitSha(rootDir, runCommand = runCommandDefault) {
  const result = runCommand('git', ['rev-parse', 'HEAD'], rootDir);
  if (result?.status !== 0) return null;
  const sha = String(result.stdout || '').trim();
  return sha || null;
}

export function buildConvergenceSnapshot(options = {}) {
  const rootDir = path.resolve(options.rootDir || resolveRoot());
  const repoConfigDir = path.resolve(options.repoConfigDir || path.join(rootDir, 'opencode-config'));
  const runtimeConfigDir = path.resolve(options.runtimeConfigDir || userConfigDir());
  const trackedConfigFiles = Array.isArray(options.trackedConfigFiles)
    ? options.trackedConfigFiles
    : ['opencode.json', 'compound-engineering.json', 'oh-my-opencode.json', 'tool-tiers.json'];
  const generatedArtifacts = Array.isArray(options.generatedArtifacts)
    ? options.generatedArtifacts
    : [path.join(runtimeConfigDir, 'tool-manifest.json')];
  const runId = String(options.runId || '').trim() || generateRunId();
  const commitSha = String(options.commitSha || '').trim() || resolveCommitSha(rootDir, options.runCommand);

  const runtimeConfigFiles = trackedConfigFiles.map((fileName) => path.join(runtimeConfigDir, fileName));
  const lockfileFiles = [path.join(rootDir, 'bun.lock')];

  const artifactClasses = {
    runtimeConfig: buildArtifactClassHash(rootDir, runtimeConfigFiles),
    lockfile: buildArtifactClassHash(rootDir, lockfileFiles),
    generatedArtifacts: buildArtifactClassHash(rootDir, generatedArtifacts),
  };

  return {
    schemaVersion: 1,
    flow: String(options.flow || 'pull-reconcile').trim() || 'pull-reconcile',
    generatedAt: new Date().toISOString(),
    runId,
    commitSha,
    rootDir,
    repoConfigDir,
    runtimeConfigDir,
    governedArtifactClasses: [...CONVERGENCE_ARTIFACT_CLASSES],
    hashesByClass: Object.fromEntries(
      Object.entries(artifactClasses).map(([name, report]) => [name, report.hash]),
    ),
    artifactClasses,
    driftSignals: Array.isArray(options.driftSignals)
      ? options.driftSignals.map((value) => String(value || '').trim()).filter(Boolean).sort((a, b) => a.localeCompare(b))
      : [],
  };
}

export function evaluateConvergenceAttestation({ freshCloneAttestation, pullReconcileAttestation } = {}) {
  const reasons = [];
  const byClass = {};

  const freshHashes = freshCloneAttestation?.hashesByClass && typeof freshCloneAttestation.hashesByClass === 'object'
    ? freshCloneAttestation.hashesByClass
    : null;
  const pullHashes = pullReconcileAttestation?.hashesByClass && typeof pullReconcileAttestation.hashesByClass === 'object'
    ? pullReconcileAttestation.hashesByClass
    : null;

  if (!freshHashes) {
    reasons.push('CONVERGENCE_ATTESTATION_MISSING:fresh-clone: hashesByClass missing');
  }
  if (!pullHashes) {
    reasons.push('CONVERGENCE_ATTESTATION_MISSING:pull-reconcile: hashesByClass missing');
  }

  for (const artifactClass of CONVERGENCE_ARTIFACT_CLASSES) {
    const fresh = freshHashes ? String(freshHashes[artifactClass] || '').trim() : '';
    const pull = pullHashes ? String(pullHashes[artifactClass] || '').trim() : '';
    byClass[artifactClass] = {
      freshCloneHash: fresh || null,
      pullReconcileHash: pull || null,
      equivalent: Boolean(fresh && pull && fresh === pull),
    };

    if (!fresh || !pull) {
      reasons.push(`CONVERGENCE_ATTESTATION_MISSING:${artifactClass}: missing ${!fresh ? 'fresh-clone' : ''}${!fresh && !pull ? '+' : ''}${!pull ? 'pull-reconcile' : ''} hash`);
      continue;
    }

    if (fresh !== pull) {
      reasons.push(`CONVERGENCE_HASH_MISMATCH:${artifactClass}: fresh-clone=${fresh} pull-reconcile=${pull}`);
    }
  }

  const driftSignals = Array.isArray(pullReconcileAttestation?.driftSignals)
    ? pullReconcileAttestation.driftSignals.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  for (const signal of driftSignals) {
    reasons.push(`CONVERGENCE_DRIFT_DETECTED:${signal}`);
  }

  const uniqueReasons = [...new Set(reasons)];
  return {
    status: uniqueReasons.length === 0 ? 'passed' : 'failed',
    reasons: uniqueReasons,
    governedArtifactClasses: [...CONVERGENCE_ARTIFACT_CLASSES],
    equivalenceByClass: byClass,
  };
}

function writeConvergenceAttestation(attestationPath, snapshot) {
  ensureParent(attestationPath);
  writeFileSync(attestationPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function detectLockfileDrift(rootDir) {
  const packageJsonPath = path.join(rootDir, 'package.json');
  const lockfilePath = path.join(rootDir, 'bun.lock');
  if (!existsSync(packageJsonPath)) {
    return false;
  }
  if (!existsSync(lockfilePath)) {
    return true;
  }

  try {
    const packageStat = statSync(packageJsonPath);
    const lockStat = statSync(lockfilePath);
    return packageStat.mtimeMs > lockStat.mtimeMs;
  } catch {
    return true;
  }
}

function detectGeneratedDrift(generatedArtifacts = []) {
  return generatedArtifacts.some((filePath) => !existsSync(filePath));
}

function readManifest(runtimeConfigDir) {
  const manifestPath = path.join(runtimeConfigDir, 'config-manifest.json');
  const manifest = readJson(manifestPath, null);
  return {
    manifestPath,
    manifest: manifest && typeof manifest === 'object' ? manifest : { version: 0, files: {} },
  };
}

function writeManifest(manifestPath, manifest, fileHashes) {
  const next = {
    ...manifest,
    version: Number(manifest.version || 0) + 1,
    machineId: hostname(),
    lastSync: new Date().toISOString(),
    files: {
      ...(manifest.files && typeof manifest.files === 'object' ? manifest.files : {}),
      ...fileHashes,
    },
  };
  writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

export function syncReconcile(options = {}) {
  const rootDir = path.resolve(options.rootDir || resolveRoot());
  const repoConfigDir = path.resolve(options.repoConfigDir || path.join(rootDir, 'opencode-config'));
  const runtimeConfigDir = path.resolve(options.runtimeConfigDir || userConfigDir());
  const trackedConfigFiles = Array.isArray(options.trackedConfigFiles)
    ? options.trackedConfigFiles
    : ['opencode.json', 'compound-engineering.json', 'oh-my-opencode.json', 'tool-tiers.json'];
  const generatedArtifacts = Array.isArray(options.generatedArtifacts)
    ? options.generatedArtifacts
    : [path.join(runtimeConfigDir, 'tool-manifest.json')];
  const runCommand = typeof options.runCommand === 'function' ? options.runCommand : runCommandDefault;
  const runId = String(options.runId || '').trim() || generateRunId();
  const commitSha = String(options.commitSha || '').trim() || resolveCommitSha(rootDir, runCommand);
  const convergenceFlow = String(options.convergenceFlow || 'pull-reconcile').trim() || 'pull-reconcile';
  const convergenceAttestationPath = path.resolve(
    options.convergenceAttestationPath
      || path.join(rootDir, '.sisyphus', 'evidence', `${convergenceFlow}-convergence.json`),
  );

  const report = {
    ok: true,
    reconciled: [],
    blocked: [],
    reasons: [],
    timestamp: new Date().toISOString(),
  };

  const { manifestPath, manifest } = readManifest(runtimeConfigDir);
  const manifestFiles = manifest.files && typeof manifest.files === 'object' ? manifest.files : {};
  const manifestUpdates = {};

  for (const fileName of trackedConfigFiles) {
    const sourcePath = path.join(repoConfigDir, fileName);
    const targetPath = path.join(runtimeConfigDir, fileName);

    if (!existsSync(sourcePath)) {
      report.reasons.push(`Tracked repo config file is missing: ${fileName}`);
      continue;
    }

    const repoHash = sha256File(sourcePath);
    const manifestHash = typeof manifestFiles[fileName] === 'string' ? manifestFiles[fileName] : null;
    const runtimeExists = existsSync(targetPath);
    const runtimeHash = runtimeExists ? sha256File(targetPath) : null;

    if (!runtimeExists) {
      ensureParent(targetPath);
      copyFileSync(sourcePath, targetPath);
      manifestUpdates[fileName] = repoHash;
      report.reconciled.push(`config-created:${fileName}`);
      continue;
    }

    if (runtimeHash === repoHash) {
      manifestUpdates[fileName] = repoHash;
      continue;
    }

    if (manifestHash && runtimeHash !== manifestHash && repoHash !== manifestHash) {
      report.blocked.push(`config-conflict:${fileName}`);
      report.reasons.push(`Protected user-local conflict: ${fileName} changed locally and upstream; refusing overwrite.`);
      continue;
    }

    if (!manifestHash && runtimeHash !== repoHash) {
      report.blocked.push(`config-unmanaged-drift:${fileName}`);
      report.reasons.push(`Cannot safely reconcile unmanaged runtime drift for ${fileName} (missing baseline manifest hash).`);
      continue;
    }

    if (manifestHash && runtimeHash !== manifestHash && repoHash === manifestHash) {
      report.reasons.push(`Preserved user-local customization: ${fileName}`);
      continue;
    }

    copyFileSync(sourcePath, targetPath);
    manifestUpdates[fileName] = repoHash;
    report.reconciled.push(`config-updated:${fileName}`);
  }

  if (report.blocked.length === 0) {
    if (Object.keys(manifestUpdates).length > 0 || !existsSync(manifestPath)) {
      ensureParent(manifestPath);
      writeManifest(manifestPath, manifest, manifestUpdates);
    }

    if (detectLockfileDrift(rootDir)) {
      const result = runCommand('bun', ['install'], rootDir);
      if (result.status !== 0) {
        report.blocked.push('deps-lockfile:install-failed');
        report.reasons.push(`bun install failed with status ${result.status ?? 'unknown'}`);
      } else {
        report.reconciled.push('deps-lockfile:reconciled');
      }
    }

    if (detectGeneratedDrift(generatedArtifacts)) {
      const result = runCommand('bun', ['run', 'generate'], rootDir);
      if (result.status !== 0) {
        report.blocked.push('generated-artifacts:generate-failed');
        report.reasons.push(`bun run generate failed with status ${result.status ?? 'unknown'}`);
      } else {
        report.reconciled.push('generated-artifacts:reconciled');
      }
    }
  }

  const convergenceSnapshot = buildConvergenceSnapshot({
    rootDir,
    repoConfigDir,
    runtimeConfigDir,
    trackedConfigFiles,
    generatedArtifacts,
    flow: convergenceFlow,
    driftSignals: report.blocked,
    runId,
    commitSha,
    runCommand,
  });
  writeConvergenceAttestation(convergenceAttestationPath, convergenceSnapshot);
  report.convergenceAttestation = {
    path: convergenceAttestationPath,
    flow: convergenceFlow,
    runId: convergenceSnapshot.runId,
    commitSha: convergenceSnapshot.commitSha,
    governedArtifactClasses: [...CONVERGENCE_ARTIFACT_CLASSES],
    hashesByClass: convergenceSnapshot.hashesByClass,
  };

  report.ok = report.blocked.length === 0;
  return report;
}

function main() {
  const report = syncReconcile();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

if (import.meta.main) {
  main();
}
