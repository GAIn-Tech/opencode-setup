# opencode-backup-manager

Automatic backup with rotation for state files. Creates timestamped backups and removes old ones based on configurable retention.

## Features

- **Timestamped Backups**: Automatic backup creation with ISO timestamps
- **Rotation**: Configurable max backup count with oldest-first cleanup
- **Restore**: Restore from any previous backup by timestamp
- **Async I/O**: Non-blocking file operations via `fs/promises`

## Usage

```javascript
import { BackupManager } from 'opencode-backup-manager';

const manager = new BackupManager({
  backupDir: '.backups',
  maxBackups: 10,
  compress: false,
});

// Create a backup
await manager.backup('/path/to/state.json');

// List available backups
const backups = await manager.list();

// Restore from a backup
await manager.restore(backups[0].timestamp);
```

## API

### `new BackupManager(options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `backupDir` | `string` | `'.backups'` | Directory for backup storage |
| `maxBackups` | `number` | `10` | Maximum backups to retain |
| `compress` | `boolean` | `false` | Enable compression |
| `enabled` | `boolean` | `true` | Enable/disable backups |

### Methods

| Method | Description |
|--------|-------------|
| `backup(filePath)` | Create a timestamped backup of the given file |
| `restore(timestamp)` | Restore state from a specific backup |
| `list()` | List all available backups |
| `rotate()` | Remove oldest backups exceeding `maxBackups` |

## License

MIT
