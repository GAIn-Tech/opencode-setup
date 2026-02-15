#!/usr/bin/env node
'use strict';

const GraphDBBridge = require('../src/index');
const { getAllDDL, ALL_SCHEMAS, getQuery } = require('../src/schemas');
const fs = require('fs');
const path = require('path');

// ─── Config ─────────────────────────────────────────────────────────────────

const DEFAULT_HOST = process.env.GORAPHDB_HOST || 'localhost';
const DEFAULT_PORT = parseInt(process.env.GORAPHDB_PORT, 10) || 7687;

function createBridge(opts = {}) {
  return new GraphDBBridge({
    host: opts.host || DEFAULT_HOST,
    port: opts.port || DEFAULT_PORT,
    protocol: opts.protocol || 'http',
  });
}

// ─── CLI Parsing ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];
const subArgs = args.slice(1);

// Parse flags from args
function parseFlags(argList) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argList.length; i++) {
    if (argList[i].startsWith('--')) {
      const key = argList[i].replace(/^--/, '');
      const next = argList[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(argList[i]);
    }
  }
  return { flags, positional };
}

// ─── Commands ───────────────────────────────────────────────────────────────

async function cmdInit(subArgs) {
  const { flags } = parseFlags(subArgs);
  const bridge = createBridge(flags);

  console.log(`Connecting to GoraphDB at ${bridge.client.baseUrl}...`);

  const alive = await bridge.ping();
  if (!alive) {
    console.error('ERROR: Cannot connect to GoraphDB server.');
    console.error(`Make sure the server is running at ${bridge.client.baseUrl}`);
    process.exit(1);
  }
  console.log('Connected.\n');

  const schemas = flags.schema ? [flags.schema] : undefined;
  console.log(`Initializing schemas: ${schemas ? schemas.join(', ') : 'all'}...`);

  const result = await bridge.initializeSchemas(schemas);
  console.log(`Executed: ${result.executed}/${result.total} DDL statements`);

  if (result.errors.length > 0) {
    console.log(`\nErrors (${result.errors.length}):`);
    result.errors.forEach((e) => console.log(`  - ${e}`));
  } else {
    console.log('All schemas initialized successfully.');
  }
}

async function cmdQuery(subArgs) {
  const { flags, positional } = parseFlags(subArgs);
  const cypherQuery = positional.join(' ');

  if (!cypherQuery) {
    console.error('Usage: goraphdb-bridge query <cypher> [--host HOST] [--port PORT]');
    console.error('Example: goraphdb-bridge query "MATCH (n) RETURN n LIMIT 10"');
    process.exit(1);
  }

  const bridge = createBridge(flags);
  console.log(`Executing: ${cypherQuery}\n`);

  try {
    const result = await bridge.cypherQuery(cypherQuery);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`Query failed: ${err.message}`);
    process.exit(1);
  }
}

async function cmdNamedQuery(subArgs) {
  const { flags, positional } = parseFlags(subArgs);
  const [schemaName, queryName] = positional;

  if (!schemaName || !queryName) {
    console.error('Usage: goraphdb-bridge named-query <schema> <queryName> [--param value ...]');
    console.error('Example: goraphdb-bridge named-query session_error recurringErrors --minSessions 3');
    console.error('\nAvailable schemas and queries:');
    for (const [name, schema] of Object.entries(ALL_SCHEMAS)) {
      console.error(`  ${name}:`);
      Object.keys(schema.queries).forEach((q) => console.error(`    - ${q}`));
    }
    process.exit(1);
  }

  const bridge = createBridge(flags);
  // Convert remaining flags to params (excluding host/port/protocol)
  const params = { ...flags };
  delete params.host;
  delete params.port;
  delete params.protocol;
  // Convert numeric strings to numbers
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string' && !isNaN(v)) params[k] = Number(v);
  }

  try {
    const result = await bridge.namedQuery(schemaName, queryName, params);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`Named query failed: ${err.message}`);
    process.exit(1);
  }
}

async function cmdInspect(subArgs) {
  const { flags, positional } = parseFlags(subArgs);
  const nodeId = positional[0];

  if (!nodeId) {
    console.error('Usage: goraphdb-bridge inspect <nodeId> [--type NodeType] [--key identityKey]');
    process.exit(1);
  }

  const bridge = createBridge(flags);
  const nodeType = flags.type || 'Node';
  const key = flags.key || 'id';

  try {
    // Get node
    const nodeResult = await bridge.cypherQuery(
      `MATCH (n:${nodeType} {${key}: $id}) RETURN n`,
      { id: nodeId }
    );
    console.log('Node:');
    console.log(JSON.stringify(nodeResult, null, 2));

    // Get relationships
    const edgeResult = await bridge.cypherQuery(
      `MATCH (n:${nodeType} {${key}: $id})-[r]-(m) RETURN type(r) AS relType, r, labels(m) AS targetLabels, m`,
      { id: nodeId }
    );
    console.log('\nRelationships:');
    console.log(JSON.stringify(edgeResult, null, 2));
  } catch (err) {
    console.error(`Inspect failed: ${err.message}`);
    process.exit(1);
  }
}

async function cmdImportSession(subArgs) {
  const { flags, positional } = parseFlags(subArgs);
  const jsonPath = positional[0];

  if (!jsonPath) {
    console.error('Usage: goraphdb-bridge import-session <path-to-json> [--host HOST] [--port PORT]');
    console.error('\nExpected JSON format:');
    console.error(JSON.stringify({
      session: { sessionId: 'ses_001', startedAt: '2025-01-01T00:00:00Z', project: 'my-project' },
      errors: [{
        error: { errorHash: 'hash1', type: 'TypeError', message: 'Cannot read property x of undefined' },
        file: { path: 'src/index.js', language: 'javascript' },
        timestamp: '2025-01-01T00:01:00Z',
        resolved: true,
        resolvedAt: '2025-01-01T00:05:00Z',
      }],
    }, null, 2));
    process.exit(1);
  }

  const absPath = path.resolve(jsonPath);
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  let sessionData;
  try {
    const raw = fs.readFileSync(absPath, 'utf-8');
    sessionData = JSON.parse(raw);
  } catch (err) {
    console.error(`Failed to parse JSON: ${err.message}`);
    process.exit(1);
  }

  const bridge = createBridge(flags);

  console.log(`Importing session: ${sessionData.session?.sessionId || 'unknown'}...`);
  try {
    const result = await bridge.importSession(sessionData);
    console.log(`\nImported:`);
    console.log(`  Session node: ${JSON.stringify(result.sessionNode)}`);
    console.log(`  Error nodes: ${result.errorNodes.length}`);
    console.log(`  Edges created: ${result.edges.length}`);
  } catch (err) {
    console.error(`Import failed: ${err.message}`);
    process.exit(1);
  }
}

async function cmdSuggest(subArgs) {
  const { flags, positional } = parseFlags(subArgs);
  const queryType = positional[0];

  if (!queryType) {
    console.error('Usage: goraphdb-bridge suggest <queryType> [--param value ...]');
    console.error('\nAvailable query types:');
    const types = [
      'error_remedies', 'recurring_errors', 'error_hotspots', 'unresolved',
      'remedy_chain', 'top_remedies', 'unremedied',
      'model_leaderboard', 'model_results', 'failing_tests', 'cost_analysis',
    ];
    types.forEach((t) => console.error(`  - ${t}`));
    process.exit(1);
  }

  const bridge = createBridge(flags);
  const context = { ...flags };
  delete context.host;
  delete context.port;
  delete context.protocol;
  for (const [k, v] of Object.entries(context)) {
    if (typeof v === 'string' && !isNaN(v)) context[k] = Number(v);
  }

  try {
    const result = await bridge.suggest(context, queryType);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`Suggest failed: ${err.message}`);
    process.exit(1);
  }
}

function cmdSchemas() {
  console.log('Available Schemas:\n');
  for (const [name, schema] of Object.entries(ALL_SCHEMAS)) {
    console.log(`  ${name}: ${schema.description}`);
    console.log(`    Nodes: ${Object.keys(schema.nodeTemplates).join(', ')}`);
    console.log(`    Edges: ${Object.keys(schema.edgeTemplates).join(', ')}`);
    console.log(`    Queries: ${Object.keys(schema.queries).join(', ')}`);
    console.log();
  }
}

function cmdDDL(subArgs) {
  const { flags } = parseFlags(subArgs);
  const statements = flags.schema
    ? require('../src/schemas').getSchemaDDL(flags.schema)
    : getAllDDL();

  console.log(`-- GoraphDB DDL (${flags.schema || 'all schemas'})`);
  console.log(`-- ${statements.length} statements\n`);
  statements.forEach((s) => console.log(`${s};\n`));
}

function showHelp() {
  console.log(`
goraphdb-bridge — Unified MCP wrapper for GoraphDB

USAGE:
  goraphdb-bridge <command> [options]

COMMANDS:
  init                              Initialize schemas on GoraphDB server
  query <cypher>                    Execute a raw Cypher query
  named-query <schema> <queryName>  Execute a pre-defined named query
  inspect <nodeId>                  Inspect a node and its relationships
  import-session <json-file>        Import a session with errors from JSON
  suggest <queryType>               Run a convenience suggestion query
  schemas                           List available schemas and queries
  ddl [--schema name]               Print Cypher DDL statements
  help                              Show this help message

GLOBAL OPTIONS:
  --host <host>       GoraphDB host (default: localhost, env: GORAPHDB_HOST)
  --port <port>       GoraphDB port (default: 7687, env: GORAPHDB_PORT)
  --protocol <proto>  Protocol (default: http, env: GORAPHDB_PROTOCOL)

EXAMPLES:
  goraphdb-bridge init
  goraphdb-bridge init --schema session_error
  goraphdb-bridge query "MATCH (n:Session) RETURN n LIMIT 5"
  goraphdb-bridge named-query runbook findRemedies --category TypeError
  goraphdb-bridge inspect ses_001 --type Session --key sessionId
  goraphdb-bridge import-session ./session-data.json
  goraphdb-bridge suggest recurring_errors --minSessions 3
  goraphdb-bridge suggest model_leaderboard --category reasoning
  goraphdb-bridge schemas
  goraphdb-bridge ddl --schema eval

ENVIRONMENT:
  GORAPHDB_HOST       Server host (default: localhost)
  GORAPHDB_PORT       Server port (default: 7687)
  GORAPHDB_PROTOCOL   Protocol (default: http)
`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  try {
    switch (command) {
      case 'init':
        await cmdInit(subArgs);
        break;
      case 'query':
        await cmdQuery(subArgs);
        break;
      case 'named-query':
        await cmdNamedQuery(subArgs);
        break;
      case 'inspect':
        await cmdInspect(subArgs);
        break;
      case 'import-session':
        await cmdImportSession(subArgs);
        break;
      case 'suggest':
        await cmdSuggest(subArgs);
        break;
      case 'schemas':
        cmdSchemas();
        break;
      case 'ddl':
        cmdDDL(subArgs);
        break;
      case 'help':
      case '--help':
      case '-h':
      case undefined:
        showHelp();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.error('Run "goraphdb-bridge help" for available commands.');
        process.exit(1);
    }
  } catch (err) {
    console.error(`Fatal: ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}

main();
