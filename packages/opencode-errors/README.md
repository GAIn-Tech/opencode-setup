# opencode-errors

Standardized error types for OpenCode. Provides consistent error categories, codes, and base classes across all packages.

## Features

- **Error Categories**: AUTH, PROVIDER, NETWORK, CONFIG, STATE, VALIDATION, TIMEOUT, RATE_LIMIT
- **Typed Error Codes**: Specific identifiers like `INVALID_API_KEY`, `MODEL_NOT_FOUND`
- **Base Error Class**: `OpenCodeError` with category, code, and metadata
- **Retryable Detection**: Built-in retry logic hints per error type

## Usage

```javascript
import { OpenCodeError, ErrorCategory, ErrorCode } from 'opencode-errors';

throw new OpenCodeError('API key expired', {
  category: ErrorCategory.AUTH,
  code: ErrorCode.EXPIRED_API_KEY,
  retryable: false,
});
```

### Error Handling

```javascript
try {
  await provider.call(prompt);
} catch (err) {
  if (err.category === ErrorCategory.RATE_LIMIT) {
    // Back off and retry
  }
}
```

## API

### `ErrorCategory`

`AUTH`, `PROVIDER`, `NETWORK`, `CONFIG`, `STATE`, `VALIDATION`, `TIMEOUT`, `RATE_LIMIT`, `INTERNAL`, `UNKNOWN`

### `ErrorCode`

Specific error identifiers: `INVALID_API_KEY`, `EXPIRED_API_KEY`, `MODEL_NOT_FOUND`, `RATE_LIMIT_EXCEEDED`, etc.

### `OpenCodeError`

Base error class extending `Error` with `category`, `code`, `retryable`, and `metadata` fields.

## License

MIT
