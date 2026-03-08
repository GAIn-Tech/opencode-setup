# opencode-shared-orchestration

Shared context utilities for OpenCode orchestration. Provides session ID management, orchestration ID generation, and quota signal normalization.

## Features

- **Orchestration IDs**: Generate unique prefixed IDs for tracking
- **Session ID Resolution**: Pick session ID from multiple context sources
- **Quota Signal Normalization**: Normalize provider quota signals across formats

## Usage

```javascript
const {
  createOrchestrationId,
  pickSessionId,
  normalizeQuotaSignal,
} = require('opencode-shared-orchestration');

const id = createOrchestrationId('task'); // "task_a1b2c3d4-..."

const sessionId = pickSessionId(context, 'ses_fallback');

const signal = normalizeQuotaSignal({
  providerId: 'openai',
  percentUsed: 0.82,
});
```

## API

| Function | Description |
|----------|-------------|
| `createOrchestrationId(prefix)` | Generate a UUID-based ID with prefix |
| `pickSessionId(context, fallback)` | Resolve session ID from context object |
| `normalizeQuotaSignal(signal)` | Normalize quota signal to standard format |

## License

MIT
