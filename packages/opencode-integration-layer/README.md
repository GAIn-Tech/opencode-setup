# opencode-integration-layer

Integration orchestration layer for OpenCode. Manages plugin loading and inter-package communication.

## Features

- **Plugin Loading**: Dynamic plugin discovery and loading
- **Event Bus**: Inter-plugin communication
- **Context Sharing**: Shared context across packages
- **Dependency Injection**: Automatic dependency resolution
- **Lifecycle Management**: Plugin init/start/stop hooks

## Installation

```bash
bun install opencode-integration-layer
```

## Usage

### Plugin Registration

```javascript
import { IntegrationLayer } from 'opencode-integration-layer';

const layer = new IntegrationLayer();

await layer.register({
  name: 'my-plugin',
  init: () => console.log('Plugin initialized'),
  destroy: () => console.log('Plugin destroyed')
});
```

### Event Bus

```javascript
layer.on('event-name', (data) => {
  console.log('Received:', data);
});

layer.emit('event-name', { message: 'hello' });
```

## API

### `IntegrationLayer`

Main integration manager.

- `register(plugin)`: Register a plugin
- `on(event, handler)`: Listen to events
- `emit(event, data)`: Emit events
- `getContext()`: Get shared context

## Testing

```bash
bun test
```

## License

MIT
