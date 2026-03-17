#!/usr/bin/env node
/**
 * cli.mjs — Context Governor CLI
 *
 * Exposes Governor API as CLI commands for use in scripts and health checks
 * without requiring the MCP server to be running.
 *
 * Usage: opencode-context-governor-cli <command> [args]
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

const { Governor } = require(join(__dirname, 'index.js'));

const [,, command, ...args] = process.argv;

function printUsage() {
  console.log(`
opencode-context-governor-cli — token budget management CLI

Commands:
  check-budget <sessionId> <model> <tokens>   Check if proposed tokens are within budget
  record-usage <sessionId> <model> <tokens>   Record actual token consumption (and save)
  get-status   <sessionId> <model>            Get remaining budget for session+model
  list-sessions                               List all tracked sessions with usage
  reset-session <sessionId> [model]           Reset budget (all models, or specific model)
  get-budgets                                 Show per-model budget configuration
  health                                      Quick health check (exits 0=ok, 1=critical)

Examples:
  opencode-context-governor-cli get-status ses_abc123 anthropic/claude-sonnet-4-5
  opencode-context-governor-cli record-usage ses_abc123 anthropic/claude-opus-4-6 5000
  opencode-context-governor-cli list-sessions
`.trim());
}

async function main() {
  if (!command || command === '--help' || command === '-h') {
    printUsage();
    process.exit(command ? 0 : 1);
  }

  let gov;
  try {
    gov = new Governor();
  } catch (err) {
    console.error(`Failed to initialize Governor: ${err.message}`);
    process.exit(1);
  }

  switch (command) {
    case 'check-budget': {
      const [sessionId, model, tokens] = args;
      if (!sessionId || !model || !tokens) {
        console.error('Usage: check-budget <sessionId> <model> <tokens>');
        process.exit(1);
      }
      const result = gov.checkBudget(sessionId, model, parseInt(tokens, 10));
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'record-usage': {
      const [sessionId, model, tokens] = args;
      if (!sessionId || !model || !tokens) {
        console.error('Usage: record-usage <sessionId> <model> <tokens>');
        process.exit(1);
      }
      const result = gov.consumeTokens(sessionId, model, parseInt(tokens, 10));
      await gov.saveToFile();
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'get-status': {
      const [sessionId, model] = args;
      if (!sessionId || !model) {
        console.error('Usage: get-status <sessionId> <model>');
        process.exit(1);
      }
      const result = gov.getRemainingBudget(sessionId, model);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'list-sessions': {
      const sessions = gov.getAllSessions();
      console.log(JSON.stringify(sessions, null, 2));
      break;
    }

    case 'reset-session': {
      const [sessionId, model] = args;
      if (!sessionId) {
        console.error('Usage: reset-session <sessionId> [model]');
        process.exit(1);
      }
      gov.resetSession(sessionId, model || null);
      await gov.saveToFile();
      console.log(JSON.stringify({ success: true, sessionId, model: model || 'all' }));
      break;
    }

    case 'get-budgets': {
      const budgets = Governor.getModelBudgets();
      console.log(JSON.stringify(budgets, null, 2));
      break;
    }

    case 'health': {
      const sessions = gov.getAllSessions();
      const sessionList = Object.values(sessions || {});
      const critical = sessionList.filter(s => (s.pct ?? 0) >= 80);
      const warn = sessionList.filter(s => (s.pct ?? 0) >= 75 && (s.pct ?? 0) < 80);
      const status = {
        ok: critical.length === 0,
        sessions: sessionList.length,
        critical: critical.length,
        warnings: warn.length,
      };
      console.log(JSON.stringify(status, null, 2));
      process.exit(critical.length > 0 ? 1 : 0);
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
