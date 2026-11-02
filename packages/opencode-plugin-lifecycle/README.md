# opencode-plugin-lifecycle

Plugin lifecycle supervisor for OpenCode. Tracks plugin health, manages quarantine for crash-prone plugins, and persists runtime state.

## Features

- **Health Evaluation**: Assess plugin stability based on crash history
- **Auto-Quarantine**: Isolate plugins exceeding crash thresholds
- **State Persistence**: Save/load plugin runtime state across restarts
- **Configurable Thresholds**: Customize crash tolerance per plugin

## Usage

```javascript
const { PluginLifecycleSupervisor } = require('@opencode/plugin-lifecycle');

const supervisor = new PluginLifecycleSupervisor({
  quarantineCrashThreshold: 3,
});

const result = supervisor.evaluatePlugin({
  name: 'my-plugin',
  crashed: true,
});

if (result.quarantined) {
  console.warn('Plugin quarantined after repeated crashes');
}
```

## API

### `new PluginLifecycleSupervisor(options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `statePath` | `string` | `~/.opencode/plugin-runtime-state.json` | State file location |
| `quarantineCrashThreshold` | `number` | `3` | Crashes before quarantine |

### Methods

| Method | Description |
|--------|-------------|
| `evaluatePlugin(input)` | Evaluate plugin health and update state |
| `getState()` | Get full plugin state map |
| `reset(name)` | Reset a plugin's crash history |

## License

MIT
