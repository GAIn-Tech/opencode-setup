#!/usr/bin/env node
'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const { MemoryGraph } = require('./index');

const OPENCODE_DIRNAME = '.opencode';

function resolveDataHome() {
  if (process.env.OPENCODE_DATA_HOME) return process.env.OPENCODE_DATA_HOME;
  if (process.env.XDG_DATA_HOME) return path.join(process.env.XDG_DATA_HOME, 'opencode');
  const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(homeDir, OPENCODE_DIRNAME);
}

const DATA_HOME = resolveDataHome();
const DEFAULT_MESSAGES_DIR = path.join(DATA_HOME, 'messages');
const DEFAULT_GRAPH_PATH = path.join(DATA_HOME, 'memory-graph.json');

const SUBCOMMANDS = ['get-graph', 'get-sessions', 'get-session-path', 'get-error-freq', 'build', 'export', 'health'];

const args = process.argv.slice(2);
const usage = `
opencode-memory-graph — session-to-error graph builder

Usage (build + export):
  opencode-memory-graph <log-path> [--format json|dot|csv] [--output <file>]

Usage (subcommands):
  opencode-memory-graph build [source]               Build graph from source path
  opencode-memory-graph get-graph                    Output full graph (nodes, edges, meta)
  opencode-memory-graph get-sessions                 List all session IDs
  opencode-memory-graph get-session-path <sessionId> Get ordered error sequence for a session
  opencode-memory-graph get-error-freq               Get ranked error frequency statistics
  opencode-memory-graph export <format> [output]     Export graph (json|dot|csv)
  opencode-memory-graph health                       Quick health check (exits 0=ok, 1=error)

Options:
  --help, -h     Show this help

Examples:
  opencode-memory-graph ~/.opencode/logs/
  opencode-memory-graph build
  opencode-memory-graph get-sessions
  opencode-memory-graph get-error-freq
  opencode-memory-graph export json ./graph.json
`;

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.log(usage.trim());
  process.exit(0);
}

// --- Subcommand dispatch ---
const firstArg = args[0];
if (SUBCOMMANDS.includes(firstArg)) {
  runSubcommand(firstArg, args.slice(1));
} else {
  // Legacy mode: <log-path> [--format ...] [--output ...]
  runLegacy(args);
}

function loadGraph(source) {
  const mg = new MemoryGraph();
  const src = source
    || (fs.existsSync(DEFAULT_GRAPH_PATH) ? DEFAULT_GRAPH_PATH : null)
    || (fs.existsSync(DEFAULT_MESSAGES_DIR) ? DEFAULT_MESSAGES_DIR : null);

  if (!src) {
    console.error(`No graph source found. Run: opencode-memory-graph build [source]`);
    process.exit(1);
  }
  mg.buildGraph(src);
  return mg;
}

function runSubcommand(cmd, rest) {
  switch (cmd) {
    case 'build': {
      const source = rest[0] ? path.resolve(rest[0]) : DEFAULT_MESSAGES_DIR;
      if (!fs.existsSync(source)) {
        console.error(`Source not found: ${source}`);
        process.exit(1);
      }
      const mg = new MemoryGraph();
      mg.buildGraph(source);
      const graph = mg.getGraph();
      const meta = graph.meta || {};
      console.log(JSON.stringify({
        built: true,
        source,
        nodes: graph.nodes ? graph.nodes.length : (meta.sessions || 0),
        edges: graph.edges ? graph.edges.length : (meta.errors || 0),
        meta,
      }, null, 2));
      break;
    }

    case 'get-graph': {
      const mg = loadGraph();
      console.log(JSON.stringify(mg.getGraph(), null, 2));
      break;
    }

    case 'get-sessions': {
      const mg = loadGraph();
      console.log(JSON.stringify(mg.getSessions(), null, 2));
      break;
    }

    case 'get-session-path': {
      const [sessionId] = rest;
      if (!sessionId) {
        console.error('Usage: get-session-path <sessionId>');
        process.exit(1);
      }
      const mg = loadGraph();
      console.log(JSON.stringify(mg.getSessionPath(sessionId), null, 2));
      break;
    }

    case 'get-error-freq': {
      const mg = loadGraph();
      console.log(JSON.stringify(mg.getErrorFrequency(), null, 2));
      break;
    }

    case 'export': {
      const [format, output] = rest;
      if (!format) {
        console.error('Usage: export <json|dot|csv> [outputPath]');
        process.exit(1);
      }
      const mg = loadGraph();
      const outPath = output ? path.resolve(output) : null;
      const content = mg.export(format, outPath);
      if (!outPath) {
        if (content) process.stdout.write(typeof content === 'string' ? content : JSON.stringify(content, null, 2));
      } else {
        console.error(`Written to: ${outPath}`);
      }
      break;
    }

    case 'health': {
      try {
        const mg = loadGraph();
        const sessions = mg.getSessions();
        const freq = mg.getErrorFrequency();
        console.log(JSON.stringify({
          ok: true,
          sessions: sessions.length,
          error_types: freq.length,
          top_error: freq[0] || null,
        }, null, 2));
        process.exit(0);
      } catch (err) {
        console.log(JSON.stringify({ ok: false, error: err.message }, null, 2));
        process.exit(1);
      }
      break;
    }
  }
}

function runLegacy(argv) {
  let logPath = null;
  let format = 'json';
  let output = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--format' || arg === '-f') {
      format = argv[++i];
    } else if (arg === '--output' || arg === '-o') {
      output = argv[++i];
    } else if (!arg.startsWith('-')) {
      logPath = arg;
    }
  }

  if (!logPath) {
    logPath = DEFAULT_MESSAGES_DIR;
  }

  try {
    const mg = new MemoryGraph();
    mg.buildGraph(logPath);

    const meta = mg.getGraph().meta || {};
    if (meta.total_entries === 0) {
      console.error(`No log entries found in: ${logPath}`);
      process.exit(1);
    }

    console.error(`Parsed ${meta.total_entries} entries — ${meta.sessions} sessions, ${meta.errors} error types`);

    const content = mg.export(format, output);
    if (!output) {
      if (content) console.log(typeof content === 'string' ? content : JSON.stringify(content, null, 2));
    } else {
      console.error(`Written to: ${path.resolve(output)}`);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
