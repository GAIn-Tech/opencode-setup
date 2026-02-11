# opencode-memory-graph

Session-to-error bipartite graph builder from OpenCode runtime logs.

Parses log files (JSON, JSONL, CSV/TSV), builds a weighted graph connecting sessions to errors, and exports to JSON, Graphviz DOT, or CSV.

## Install

```bash
npm install -g opencode-memory-graph   # CLI
npm install opencode-memory-graph      # library
```

## Usage (Library)

```js
const { MemoryGraph } = require('opencode-memory-graph');

const mg = new MemoryGraph();

// From file/directory
mg.buildGraph('~/.opencode/logs/');

// Or from raw entries
mg.buildGraph([
  { session_id: 'ses_001', timestamp: '2025-01-15T10:00:00Z', error_type: 'TypeError', message: 'x is undefined' },
  { session_id: 'ses_001', timestamp: '2025-01-15T10:01:00Z', error_type: 'NetworkError', message: 'timeout' },
  { session_id: 'ses_002', timestamp: '2025-01-15T11:00:00Z', error_type: 'TypeError', message: 'y is null' },
]);

// Query
mg.getErrorFrequency();           // [{ error_type, count, first_seen, last_seen }, ...]
mg.getSessionPath('ses_001');     // [{ error_type, timestamp, message }, ...] ordered by time
mg.getSessions();                 // ['ses_001', 'ses_002']
mg.getSessionErrors('ses_001');   // [{ error_type, weight, first_seen, last_seen }]

// Export
mg.export('json', './graph.json');
mg.export('dot',  './graph.dot');   // visualize with: dot -Tpng graph.dot -o graph.png
mg.export('csv',  './report.csv');
const dotString = mg.export('dot'); // no path = return string
```

## Usage (CLI)

```bash
opencode-memory-graph ~/.opencode/logs/ -f dot -o graph.dot
opencode-memory-graph ./session.log -f csv -o report.csv
opencode-memory-graph ./logs/                               # JSON to stdout
```

## Log Format

Accepts JSON, JSONL, CSV, or TSV with fields: `session_id`, `timestamp`, `error_type`, `message`.

```jsonl
{"session_id":"ses_001","timestamp":"2025-01-15T10:00:00Z","error_type":"TypeError","message":"x is undefined"}
{"session_id":"ses_001","timestamp":"2025-01-15T10:01:00Z","error_type":"NetworkError","message":"timeout"}
```

## Graph Structure

```
{ nodes: [{ id, type: 'session'|'error', ... }],
  edges: [{ from: session_id, to: error_type, weight, first_seen, last_seen }],
  meta:  { sessions, errors, total_entries, built_at } }
```

## Export Formats

| Format | Use Case | Visualize |
|--------|----------|-----------|
| `json` | Downstream tools, APIs | — |
| `dot`  | Graph visualization | `dot -Tpng graph.dot -o graph.png` |
| `csv`  | Spreadsheets, analysis | Excel / Google Sheets |

## License

MIT
