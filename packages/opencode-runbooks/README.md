# opencode-runbooks

Pluginized auto-remediation based on error signatures for OpenCode. Matches errors to known patterns and provides actionable remediation steps.

## Install

```bash
npm install -g opencode-runbooks
```

## Usage

```js
const { Runbooks } = require('opencode-runbooks');
const rb = new Runbooks();

// Match an error string to a known pattern
const match = rb.matchError('MCP command unavailable: supermemory');
// => { id: 'MCP_NOT_FOUND', score: 8, confidence: 0.72, pattern: {...} }

// Get remedy details
const remedy = rb.getRemedy('MCP_NOT_FOUND');
// => { id, remedy, instructions, severity, hasExecutor: true }

// Execute remedy (returns instructions, never auto-fixes)
const result = rb.executeRemedy('MCP_NOT_FOUND', { mcpName: 'supermemory' });
// => { action: 'add_mcp_server', status: 'instruction', details: {...} }

// One-shot diagnose: match + remedy + execute
const diagnosis = rb.diagnose('API rate limited 429', { currentModel: 'gpt-4o' });
// => { match, remedy, result }
```

## Error Patterns (10 built-in)

| ID | Trigger | Severity |
|----|---------|----------|
| `MCP_NOT_FOUND` | MCP command unavailable | high |
| `RATE_LIMIT` | API rate limited / 429 | medium |
| `ENV_VAR_MISSING` | Required env var not set | high |
| `PLUGIN_CONFLICT` | Duplicate plugin detected | medium |
| `MODEL_UNAVAILABLE` | Model not responding | high |
| `TOKEN_BUDGET_EXCEEDED` | Token budget hit | medium |
| `SUPERMEMORY_AUTH_FAIL` | Supermemory API key invalid | high |
| `GIT_CONFLICT` | Merge/rebase conflict | high |
| `PERMISSION_DENIED` | File/resource access denied | high |
| `PORT_IN_USE` | Port already bound | medium |

## Custom Patterns

```js
const rb = new Runbooks({
  customPatterns: {
    MY_ERROR: {
      keywords: ['custom', 'error'],
      message: 'Custom error occurred',
      severity: 'low',
      remedy: 'myFix',
      instructions: 'Do the thing.',
    },
  },
  customRemedies: {
    myFix: (ctx) => ({ action: 'fix', status: 'instruction', details: { message: 'Fixed!' } }),
  },
});
```

## API

- **`matchError(error)`** — Fuzzy match error string/object to best pattern
- **`matchAll(error, minScore?)`** — All patterns above threshold
- **`getRemedy(errorId)`** — Get remedy details for a pattern ID
- **`executeRemedy(errorId, context?)`** — Run remedy function (returns instructions)
- **`diagnose(error, context?)`** — One-shot match + remedy + execute
- **`listPatterns()`** — List all registered patterns
- **`registerPattern(id, pattern, remedyFn?)`** — Add pattern at runtime

## License

MIT
