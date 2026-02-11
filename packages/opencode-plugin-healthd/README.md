# opencode-plugin-healthd

Daemon-mode health checker for OpenCode plugins and MCPs. Runs in the background, checks every 5 minutes, logs to `~/.opencode/healthd.log`.

## Install

```bash
npm install -g opencode-plugin-healthd
```

## Usage

### Start daemon

```bash
npm start
# or directly:
opencode-healthd
```

### Stop daemon

```bash
npm stop
```

### Check status

```bash
npm run status
```

### Log location

```
~/.opencode/healthd.log
```

PID file: `~/.opencode/healthd.pid`

## What it checks

**Plugins** (`checkPlugins()`):
- Scans `npm list -g` for known-bad packages:
  - `opencode-token-monitor` (Windows ENOENT errors)
  - `@ccusage/opencode` (CLI hijack)
- Detects duplicate global packages

**MCPs** (`checkMCPs()`):
- Verifies MCP commands are reachable on PATH: `context7`, `sequentialthinking`, `websearch`, `grep`, `distill`
- Checks for MCP config file in `~/.opencode/`

## Programmatic usage

```js
const { Healthd } = require('opencode-plugin-healthd');

const hd = new Healthd();

hd.on('check:complete', (result) => {
  console.log(result.status); // 'ok' | 'warn' | 'error'
  console.log(result.plugins.issues);
  console.log(result.mcps.issues);
});

hd.on('state:change', ({ from, to }) => {
  console.log(`Health: ${from} -> ${to}`);
});

hd.runCheck();
```

## Events

| Event | Payload | When |
|-------|---------|------|
| `check:start` | — | Before each check cycle |
| `check:complete` | `{ status, plugins, mcps, timestamp }` | After successful check |
| `check:error` | `Error` | If check throws |
| `state:change` | `{ from, to, result }` | Status transitions (e.g. ok→warn) |

## License

MIT
