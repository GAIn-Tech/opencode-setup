#!/usr/bin/env bun
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { CodebaseMemory } = require('./index.js');

const [,, cmd, ...args] = process.argv;

function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      flags[args[i].slice(2)] = args[i + 1];
      i++;
    } else {
      positional.push(args[i]);
    }
  }
  return { flags, positional };
}

async function main() {
  const mem = new CodebaseMemory();
  const { flags, positional } = parseFlags(args);

  try {
    switch (cmd) {
      case 'analyze': {
        const repoPath = positional[0];
        if (!repoPath) throw new Error('Usage: analyze <repoPath> [--name <name>]');
        const result = mem.analyze(repoPath, { name: flags.name });
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      case 'query': {
        const [repo, term] = positional;
        if (!repo || !term) throw new Error('Usage: query <repo> <searchTerm> [--limit <n>]');
        const results = mem.query(repo, term, { limit: flags.limit ? parseInt(flags.limit) : 20 });
        console.log(JSON.stringify(results, null, 2));
        break;
      }
      case 'context': {
        const [repo, symbol] = positional;
        if (!repo || !symbol) throw new Error('Usage: context <repo> <symbolName>');
        const result = mem.context(repo, symbol);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      case 'impact': {
        const [repo, symbol] = positional;
        if (!repo || !symbol) throw new Error('Usage: impact <repo> <symbolName> [--depth <n>]');
        const result = mem.impact(repo, symbol, { depth: flags.depth ? parseInt(flags.depth) : 3 });
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      case 'detect-changes': {
        const [repo] = positional;
        if (!repo) throw new Error('Usage: detect-changes <repo>');
        const result = mem.detectChanges(repo);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      case 'list-repos': {
        const repos = mem.listRepos();
        console.log(JSON.stringify(repos, null, 2));
        break;
      }
      case 'health': {
        const repos = mem.listRepos();
        const GraphStore = require('./graph-store.js').GraphStore;
        const health = repos.map(r => {
          const store = new GraphStore(r.dbPath);
          const stats = store.getStats();
          store.close();
          return { ...r, stats };
        });
        console.log(JSON.stringify(health, null, 2));
        break;
      }
      case 'enrich-error': {
        const errorText = positional.join(' ');
        if (!errorText) throw new Error('Usage: enrich-error <errorText>');
        const results = mem.enrichErrorContext(errorText);
        console.log(JSON.stringify(results, null, 2));
        break;
      }
      default:
        console.error(JSON.stringify({
          error: `Unknown command: ${cmd}`,
          commands: ['analyze', 'query', 'context', 'impact', 'detect-changes', 'list-repos', 'health', 'enrich-error']
        }));
        process.exit(1);
    }
  } catch (err) {
    console.error(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
}

main();
