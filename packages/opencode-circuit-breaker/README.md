# opencode-circuit-breaker

Circuit breaker pattern for provider failure prevention. Protects against cascading failures by tracking error rates and temporarily disabling unhealthy providers.

## Features

- **Three States**: CLOSED (normal), OPEN (failing), HALF_OPEN (testing recovery)
- **Configurable Thresholds**: Failure count, success count, and timeout
- **Auto Recovery**: Automatic transition from OPEN to HALF_OPEN after timeout
- **Provider Isolation**: Per-provider circuit state tracking

## Usage

```javascript
import { CircuitBreaker } from 'opencode-circuit-breaker';

const cb = new CircuitBreaker('openai', {
  failureThreshold: 5,   // Open after 5 failures
  successThreshold: 2,   // Close after 2 successes in HALF_OPEN
  timeout: 30000,        // Try recovery after 30s
});

try {
  const result = await cb.execute(() => api.call());
} catch (e) {
  if (cb.isOpen()) {
    // Provider is down, use fallback
  }
}
```

## API

### `new CircuitBreaker(name, options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `failureThreshold` | `number` | `5` | Failures before opening |
| `successThreshold` | `number` | `2` | Successes to close from HALF_OPEN |
| `timeout` | `number` | `30000` | Milliseconds before recovery attempt |

### Methods

| Method | Description |
|--------|-------------|
| `execute(fn)` | Run function through circuit breaker |
| `isOpen()` | Check if circuit is open (failing) |
| `isClosed()` | Check if circuit is closed (healthy) |
| `getState()` | Get current state object |
| `reset()` | Force reset to CLOSED |

## License

MIT
