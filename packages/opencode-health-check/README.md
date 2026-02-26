# opencode-health-check

Health monitoring system for OpenCode. Tracks system vitals, detects issues, and triggers alerts.

## Features

- **System Vitals**: CPU, memory, disk monitoring
- **Health Checks**: Configurable health check probes
- **Alerting**: Threshold-based alerts
- **Telemetry**: Metrics collection and export
- **Scheduler**: Periodic health checks with cron-like scheduling

## Installation

```bash
bun install opencode-health-check
```

## Usage

### Basic Health Check

```javascript
import { HealthChecker } from 'opencode-health-check';

const checker = new HealthChecker();

checker.addCheck('database', async () => {
  // Check database connection
  return { status: 'healthy', latency: 10 };
});

const health = await checker.check();
```

### Scheduled Checks

```javascript
checker.schedule('*/5 * * * *', 'disk-space', async () => {
  // Check disk space every 5 minutes
});
```

## API

### `HealthChecker`

Main health check manager.

- `addCheck(name, fn)`: Add a health check
- `check()`: Run all checks
- `schedule(cron, name, fn)`: Schedule periodic checks

### `AlertManager`

Alert management.

- `addAlert(name, threshold)`: Configure alert
- `onAlert(name, callback)`: Alert callback

## Testing

```bash
bun test
```

## License

MIT
