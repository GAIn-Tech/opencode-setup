#!/usr/bin/env node
'use strict';

const { Proofcheck } = require('./index');

// ─── Parse CLI args ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = {
  force: args.includes('--force') || args.includes('-f'),
  verbose: args.includes('--verbose') || args.includes('-v'),
  help: args.includes('--help') || args.includes('-h'),
  skip: [],
};

// Parse --skip gitStatus,tests
const skipIdx = args.findIndex((a) => a === '--skip');
if (skipIdx !== -1 && args[skipIdx + 1]) {
  flags.skip = args[skipIdx + 1].split(',').map((s) => s.trim());
}

// Parse --cwd /path/to/project
const cwdIdx = args.findIndex((a) => a === '--cwd');
const cwd = cwdIdx !== -1 && args[cwdIdx + 1] ? args[cwdIdx + 1] : process.cwd();

// ─── Help ────────────────────────────────────────────────────────────────────

if (flags.help) {
  console.log(`
  opencode-proofcheck — deployment gate

  Usage:
    proofcheck [options]

  Options:
    --force, -f         Bypass gate (user takes risk)
    --verbose, -v       Show details for passing checks
    --skip <checks>     Comma-separated checks to skip
                        (gitStatus,tests,lint,security,branchSync)
    --cwd <path>        Project root (default: current dir)
    --help, -h          Show this help

  Gate logic:
    (git clean) AND (tests pass) AND (lint pass) = safe to commit/push

  Examples:
    proofcheck                    # Run all checks
    proofcheck --force            # Bypass (reports but exits 0)
    proofcheck --skip security    # Skip security audit
    proofcheck --cwd /my/project  # Check different project
`);
  process.exit(0);
}

// ─── Run ─────────────────────────────────────────────────────────────────────

async function main() {
  const pc = new Proofcheck({
    cwd,
    force: flags.force,
    skip: flags.skip,
    verbose: flags.verbose,
  });

  // Detect branch for display
  let branch = null;
  try {
    const { exec } = require('./checks');
    const branchResult = exec('git branch --show-current', { cwd });
    if (branchResult.exitCode === 0) branch = branchResult.stdout;
  } catch { /* not in git repo */ }

  const gate = await pc.gateDeployment(branch);
  console.log(gate.summary);

  if (flags.verbose) {
    for (const [name, r] of Object.entries(gate.results)) {
      if (r.details) {
        console.log(`\n  --- ${name} details ---`);
        console.log(`  ${r.details.split('\n').join('\n  ')}`);
      }
    }
  }

  process.exit(gate.safe ? 0 : 1);
}

main().catch((err) => {
  console.error('Proofcheck error:', err.message);
  process.exit(1);
});
