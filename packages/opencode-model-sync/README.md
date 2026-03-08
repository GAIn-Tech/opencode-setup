# opencode-model-sync

Automated model catalog synchronization. Fetches latest model information and validates against the known catalog on a weekly/daily schedule.

## Features

- **Catalog Sync**: Pull latest model data from providers
- **Validation**: Verify synced models against known catalog
- **Backup**: Auto-backup before sync operations
- **Configurable Interval**: Weekly or daily sync schedule

## Usage

```javascript
import ModelSync from 'opencode-model-sync';

const sync = new ModelSync({
  interval: 'weekly',
  catalogPath: './models/catalog-2026.json',
});

await sync.run();
```

### CLI

```bash
# Run sync manually
bun run sync

# Or via npm script
bun run start
```

## Configuration

| Env Variable | Default | Description |
|-------------|---------|-------------|
| `MODEL_SYNC_INTERVAL` | `'weekly'` | Sync frequency (`weekly` or `daily`) |
| `MODEL_CATALOG_PATH` | `opencode-config/models/catalog-2026.json` | Catalog file path |
| `MODEL_BACKUP_DIR` | Auto-detected | Backup directory for pre-sync state |

## License

MIT
