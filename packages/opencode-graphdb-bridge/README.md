# opencode-goraphdb-bridge

Unified MCP wrapper layer over GoraphDB REST API for three high-fit packages:
- **opencode-memory-graph** — Session → Error relationships
- **opencode-runbooks** — Error → Remedy mappings
- **opencode-eval-harness** — Test → Model → Outcome relationships

## Install

```bash
npm install -g opencode-goraphdb-bridge
# or locally
npm install opencode-goraphdb-bridge
```

## Prerequisites

GoraphDB server running (default: `localhost:7687`). Deploy separately via Docker or binary.

## Programmatic Usage

```js
const GraphDBBridge = require('opencode-goraphdb-bridge');

const bridge = new GraphDBBridge({
  host: 'localhost',
  port: 7687,
  autoInit: true, // auto-run schema DDL on first operation
});

// Initialize schemas (constraints + indexes)
await bridge.initializeSchemas();

// Upsert nodes
await bridge.upsertNode('Session', {
  sessionId: 'ses_001',
  startedAt: new Date().toISOString(),
  project: 'my-app',
});

await bridge.upsertNode('Error', {
  errorHash: 'abc123',
  type: 'TypeError',
  message: 'Cannot read property x of undefined',
});

// Create edges
await bridge.upsertEdge('ses_001', 'abc123', 'ENCOUNTERED', {
  timestamp: new Date().toISOString(),
}, {
  fromType: 'Session', toType: 'Error',
  fromKey: 'sessionId', toKey: 'errorHash',
});

// Raw Cypher
const result = await bridge.cypherQuery(
  'MATCH (s:Session)-[:ENCOUNTERED]->(e:Error) RETURN s, e LIMIT 10'
);

// Named queries from schema
const recurring = await bridge.namedQuery('session_error', 'recurringErrors', {
  minSessions: 3,
});

// Convenience suggestions
const remedies = await bridge.suggest({ category: 'TypeError' }, 'error_remedies');
const leaderboard = await bridge.suggest({ category: 'reasoning' }, 'model_leaderboard');

// Bulk session import
await bridge.importSession({
  session: { sessionId: 'ses_002', startedAt: '2025-01-01T00:00:00Z' },
  errors: [{
    error: { errorHash: 'def456', type: 'ReferenceError', message: 'x is not defined' },
    file: { path: 'src/utils.js', language: 'javascript' },
    timestamp: '2025-01-01T00:01:00Z',
  }],
});
```

## CLI

```bash
# Initialize all schemas
goraphdb-bridge init

# Initialize specific schema
goraphdb-bridge init --schema session_error

# Run Cypher query
goraphdb-bridge query "MATCH (n:Session) RETURN n LIMIT 5"

# Named queries
goraphdb-bridge named-query runbook findRemedies --category TypeError

# Inspect a node
goraphdb-bridge inspect ses_001 --type Session --key sessionId

# Import session from JSON
goraphdb-bridge import-session ./session-data.json

# Suggestion queries
goraphdb-bridge suggest recurring_errors --minSessions 3
goraphdb-bridge suggest model_leaderboard --category reasoning

# View schemas
goraphdb-bridge schemas

# Print DDL
goraphdb-bridge ddl --schema eval
```

## Schemas

| Schema | Domain | Node Types | Edge Types |
|--------|--------|------------|------------|
| `session_error` | memory-graph | Session, Error, File | ENCOUNTERED, OCCURRED_IN, RESOLVED |
| `runbook` | runbooks | ErrorType, Remedy, Runbook | HAS_REMEDY, NEXT_STEP, SUCCEEDED_FOR, BELONGS_TO |
| `eval` | eval-harness | TestCase, Model, Result, TestSuite | EVALUATED_BY, PRODUCED, CONTAINS, DEPENDS_ON, FOR_TEST |

## Configuration

| Option | Env Var | Default |
|--------|---------|---------|
| `host` | `GORAPHDB_HOST` | `localhost` |
| `port` | `GORAPHDB_PORT` | `7687` |
| `protocol` | `GORAPHDB_PROTOCOL` | `http` |

## License

MIT
