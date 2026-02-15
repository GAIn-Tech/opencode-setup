#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { resolveRoot } from './resolve-root.mjs';

const ROOT = resolveRoot();
const POLICY_PATH = path.join(ROOT, 'opencode-config', 'learning-update-policy.json');

function parseArgs(argv) {
  const args = {
    base: null,
    head: 'HEAD',
    staged: false,
    messageFile: null
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--base') {
      args.base = argv[i + 1] ?? null;
      i += 1;
    } else if (token === '--head') {
      args.head = argv[i + 1] ?? 'HEAD';
      i += 1;
    } else if (token === '--staged') {
      args.staged = true;
    } else if (token === '--message-file') {
      args.messageFile = argv[i + 1] ?? null;
      i += 1;
    }
  }
  return args;
}

function runGit(command) {
  return execSync(command, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function startsWithAny(file, prefixes) {
  return prefixes.some((prefix) => file.startsWith(prefix));
}

function getStagedFiles() {
  const output = runGit('git diff --cached --name-only');
  if (!output) {
    return [];
  }
  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

function getCommitList(base, head) {
  if (!base) {
    return [runGit(`git rev-parse ${head}`)];
  }
  const output = runGit(`git rev-list --reverse ${base}..${head}`);
  if (!output) {
    return [];
  }
  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

function getChangedFilesForCommit(sha) {
  const output = runGit(`git diff-tree --no-commit-id --name-only -r ${sha}`);
  if (!output) {
    return [];
  }
  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

function getCommitMessage(sha) {
  return runGit(`git log -1 --pretty=%B ${sha}`);
}

function hasTrailer(message, regex) {
  return regex.test(message);
}

function validateCommitMessage(message, commitSha, changedFiles, governedPrefixes) {
  const governedChanged = changedFiles.filter((file) => startsWithAny(file, governedPrefixes));
  if (governedChanged.length === 0) {
    return;
  }

  const requiresDeploymentTrailer = changedFiles.includes('opencode-config/deployment-state.json');

  if (!hasTrailer(message, /^Learning-Update:\s+opencode-config\/learning-updates\/.+\.json$/m)) {
    throw new Error(
      `commit-governance: commit ${commitSha} changes governed paths but is missing trailer ` +
      "'Learning-Update: opencode-config/learning-updates/<file>.json'"
    );
  }

  if (!hasTrailer(message, /^Risk-Level:\s+(low|medium|high)$/m)) {
    throw new Error(
      `commit-governance: commit ${commitSha} changes governed paths but is missing trailer ` +
      "'Risk-Level: low|medium|high'"
    );
  }

  if (requiresDeploymentTrailer && !hasTrailer(message, /^Deployment-State:\s+(set|promote|rollback):.+$/m)) {
    throw new Error(
      `commit-governance: commit ${commitSha} changes deployment-state but is missing trailer ` +
      "'Deployment-State: set|promote|rollback:<details>'"
    );
  }
}

function main() {
  const args = parseArgs(process.argv);
  const policy = readJson(POLICY_PATH);

  if (args.staged) {
    const stagedFiles = getStagedFiles();
    if (stagedFiles.length === 0) {
      console.log('commit-governance: no staged files to validate');
      return;
    }

    const message = args.messageFile
      ? fs.readFileSync(path.resolve(ROOT, args.messageFile), 'utf8')
      : runGit('git log -1 --pretty=%B HEAD');

    validateCommitMessage(message, 'staged', stagedFiles, policy.governed_paths);
    console.log('commit-governance: PASS (staged changes checked)');
    return;
  }

  const commits = getCommitList(args.base, args.head);

  if (commits.length === 0) {
    console.log('commit-governance: no commits to validate');
    return;
  }

  for (const sha of commits) {
    const changedFiles = getChangedFilesForCommit(sha);
    const message = getCommitMessage(sha);
    validateCommitMessage(message, sha, changedFiles, policy.governed_paths);
  }

  console.log(`commit-governance: PASS (${commits.length} commit(s) checked)`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
