'use strict';

/**
 * Shared test environment for tool-usage-tracker tests.
 *
 * The tracker module caches HOME-derived paths at require-time. When multiple
 * test files require() the same module, only the first require captures paths.
 * This shared setup ensures every test file sees the same tmpDir.
 *
 * Node/Bun module cache guarantees this runs exactly once per process.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-usage-shared-'));
const savedHome = process.env.HOME;
const savedUserProfile = process.env.USERPROFILE;

process.env.HOME = tmpDir;
process.env.USERPROFILE = tmpDir;

const DATA_DIR = path.join(tmpDir, '.opencode', 'tool-usage');
const INVOCATIONS_FILE = path.join(DATA_DIR, 'invocations.json');
const METRICS_FILE = path.join(DATA_DIR, 'metrics.json');

// Create directory structure before any tests run
fs.mkdirSync(DATA_DIR, { recursive: true });

function restoreEnv() {
  process.env.HOME = savedHome;
  process.env.USERPROFILE = savedUserProfile;
}

function cleanupTmpDir() {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
}

module.exports = {
  tmpDir,
  DATA_DIR,
  INVOCATIONS_FILE,
  METRICS_FILE,
  restoreEnv,
  cleanupTmpDir,
};
