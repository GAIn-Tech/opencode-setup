# opencode-logger

Structured logging system for OpenCode. Correlation ID propagation and context-aware logging.

## Features

- **Structured Logging**: JSON format logs
- **Correlation IDs**: Request tracing across async boundaries
- **Log Levels**: TRACE, DEBUG, INFO, WARN, ERROR
- **Context Propagation**: AsyncLocalStorage-based context
- **Redaction**: Automatic PII redaction

## Installation

```bash
bun install opencode-logger
```

## Usage

### Basic Logging

```javascript
import { logger } from 'opencode-logger';

logger.info('User logged in', { userId: 123 });
logger.error('Database connection failed', { error });
```

### Correlation ID

```javascript
import { withCorrelationId, getCorrelationId } from 'opencode-logger';

await withCorrelationId(async () => {
  const id = getCorrelationId();
  logger.info('Processing request', { correlationId: id });
  // All logs in this async context share the same ID
}, 'request-123');
```

## API

### `logger`

Main logger instance.

- `logger.trace(msg, meta)`
- `logger.debug(msg, meta)`
- `logger.info(msg, meta)`
- `logger.warn(msg, meta)`
- `logger.error(msg, meta)`

### `withCorrelationId(fn, id)`

Run function with correlation ID context.

### `getCorrelationId()`

Get current correlation ID.

## Testing

```bash
bun test
```

## License

MIT
