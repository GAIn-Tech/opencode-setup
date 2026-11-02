#!/usr/bin/env node

/**
 * init-kb.mjs - Knowledge Base Initialization Script
 * 
 * Initializes .sisyphus/kb/ with core knowledge base files.
 * Can be run standalone or integrated with setup flow.
 * 
 * Usage:
 *   bun run init-kb           # Auto-detect and init if needed
 *   bun run init-kb --force   # Force reinitialization
 *   bun run init-kb --check   # Just check if init needed
 */

import { KbInitializer } from '../packages/opencode-init-kb/src/kb-initializer.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const args = process.argv.slice(2);
const isCheck = args.includes('--check');
const isForce = args.includes('--force');

// Get workspace root (default to repo root, allow override via --workspace)
const workspaceIdx = args.indexOf('--workspace');
const workspaceRoot = workspaceIdx >= 0 && args[workspaceIdx + 1] 
  ? args[workspaceIdx + 1] 
  : repoRoot;

console.log('[init-kb] Starting KB initialization...');
console.log('[init-kb] Workspace:', workspaceRoot);

const initializer = new KbInitializer({
  workspaceRoot,
  forceInit: isForce
});

if (isCheck) {
  const check = initializer.detectInitNeeded();
  console.log('[init-kb] Detection result:', check.reason);
  console.log('[init-kb] Needs init:', check.needsInit);
  process.exit(check.needsInit ? 1 : 0);
}

const check = initializer.detectInitNeeded();

if (!check.needsInit) {
  console.log('[init-kb] KB already initialized');
  console.log('[init-kb] State:', JSON.stringify(initializer.getState(), null, 2));
  process.exit(0);
}

console.log('[init-kb] KB needs initialization:', check.reason);

const result = initializer.initialize({ templateType: 'default' });

if (result.success) {
  console.log('[init-kb] KB initialized successfully');
  console.log('[init-kb] Files created:', result.files.map(f => f.filename).join(', '));
  console.log('[init-kb] KB directory:', result.kbDir);
  process.exit(0);
} else {
  console.error('[init-kb] ERROR: KB initialization failed');
  process.exit(1);
}
