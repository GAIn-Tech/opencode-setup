# opencode-dashboard-launcher

Auto-launch and manage the OpenCode dashboard as a singleton process. Ensures only one dashboard instance runs at a time.

## Features

- **Singleton Management**: Prevents duplicate dashboard processes
- **Auto-Launch**: Starts dashboard on first access
- **PID Tracking**: Monitors running dashboard via PID file
- **CLI Interface**: `opencode-dashboard` binary for manual control

## Usage

```javascript
const { launchDashboard, isDashboardRunning } = require('opencode-dashboard-launcher');

// Check if dashboard is already running
if (!isDashboardRunning()) {
  await launchDashboard({ port: 3000 });
}
```

### CLI

```bash
# Launch dashboard
opencode-dashboard

# Launch on specific port
opencode-dashboard --port 3001
```

## API

| Function | Description |
|----------|-------------|
| `launchDashboard(options)` | Start the dashboard process |
| `isDashboardRunning()` | Check if a dashboard instance exists |
| `stopDashboard()` | Stop the running dashboard |
| `getDashboardUrl()` | Get the URL of the running dashboard |

## License

MIT
