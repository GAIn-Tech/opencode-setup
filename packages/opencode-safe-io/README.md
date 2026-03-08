# opencode-safe-io

Shared safe I/O utilities for OpenCode. Provides guarded JSON parsing, managed timers, and managed event listeners to prevent common failure modes.

## Features

- **Safe JSON Parse**: Parse with fallback, size guard (50MB limit), and error logging
- **Managed Timers**: Auto-cleanup timers that prevent memory leaks
- **Managed Listeners**: Event listeners with automatic removal on cleanup
- **Size Guards**: Reject oversized payloads before parsing

## Usage

```javascript
const { safeJsonParse, createManagedTimer, createManagedListener } = require('opencode-safe-io');

// Safe JSON parsing with fallback
const data = safeJsonParse(rawString, {}, 'config-loader');

// Managed timer (auto-cleanup)
const timer = createManagedTimer(() => poll(), 5000);
timer.clear(); // Manual cleanup

// Managed listener (auto-cleanup)
const listener = createManagedListener(emitter, 'data', handler);
listener.remove();
```

## API

### `safeJsonParse(str, fallback, label)`

Parse JSON safely with fallback on failure. Guards against non-string input and strings exceeding 50MB.

### `createManagedTimer(fn, interval)`

Create an interval timer that can be cleanly stopped. Returns object with `clear()` method.

### `createManagedListener(emitter, event, handler)`

Attach an event listener with clean removal. Returns object with `remove()` method.

## License

MIT
