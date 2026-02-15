#!/usr/bin/env node
'use strict';

const path = require('path');
const { MemoryGraph } = require('./index');

const args = process.argv.slice(2);
const usage = `
opencode-memory-graph — session-to-error graph builder

Usage:
  opencode-memory-graph <log-path> [--format json|dot|csv] [--output <file>]

Options:
  <log-path>       Path to log file or directory (default: ~/.opencode/logs/)
  --format, -f     Export format: json, dot, csv (default: json)
  --output, -o     Output file path (default: stdout)
  --help, -h       Show this help

Examples:
  opencode-memory-graph ~/.opencode/logs/
  opencode-memory-graph ./session.log -f dot -o graph.dot
  opencode-memory-graph ./logs/ -f csv -o report.csv
`;

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.log(usage.trim());
  process.exit(0);
}

// Parse CLI args
let logPath = null;
let format = 'json';
let output = null;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--format' || arg === '-f') {
    format = args[++i];
  } else if (arg === '--output' || arg === '-o') {
    output = args[++i];
  } else if (!arg.startsWith('-')) {
    logPath = arg;
  }
}

if (!logPath) {
  logPath = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.opencode', 'logs');
}

try {
  const mg = new MemoryGraph();
  mg.buildGraph(logPath);

  const meta = mg.getGraph().meta;
  if (meta.total_entries === 0) {
    console.error(`No log entries found in: ${logPath}`);
    process.exit(1);
  }

  console.error(`Parsed ${meta.total_entries} entries — ${meta.sessions} sessions, ${meta.errors} error types`);

  const content = mg.export(format, output);
  if (!output) {
    console.log(content);
  } else {
    console.error(`Written to: ${path.resolve(output)}`);
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
