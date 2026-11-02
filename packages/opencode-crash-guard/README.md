# opencode-crash-guard

Crash protection and recovery system for OpenCode. Prevents Bun v1.3.x ENOENT segfaults and provides graceful error handling.

## Features

- **ENOENT Segfault Protection**: Prevents Bun v1.3.x crashes from missing commands
- **Safe Spawn**: `safeSpawn()` wrapper that checks command existence before execution
- **Graceful Degradation**: Falls back to safe alternatives on spawn failures
- **Memory Guard**: Monitors memory usage and prevents OOM
- **Crash Recovery**: Automatic recovery from unexpected crashes

## Installation

```bash
bun install opencode-crash-guard
```

## Usage

### Safe Spawn

```javascript
import { safeSpawn, commandExists } from 'opencode-crash-guard';

// Check if command exists
if (commandExists('git')) {
  const result = safeSpawn('git', ['status']);
}

// Safe spawn with automatic ENOENT handling
const result = safeSpawn('some-command', ['arg1'], {
  onENOENT: () => console.log('Command not found')
});
```

### Crash Recovery

```javascript
import { CrashRecovery } from 'opencode-crash-guard';

const recovery = new CrashRecovery();
recovery.onCrash((error) => {
  console.log('Recovered from crash:', error.message);
});
```

## API

### `safeSpawn(command, args, options)`

Safely spawn a process with ENOENT protection.

- `command`: Command to spawn
- `args`: Array of arguments
- `options`: Spawn options
  - `onENOENT`: Callback when command not found

### `commandExists(command)`

Check if a command exists in PATH.

- `command`: Command name
- Returns: Boolean

## Testing

```bash
bun test
```

## License

MIT
