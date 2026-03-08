# opencode-test-utils

Test utilities for OpenCode packages. Provides mock implementations, fixtures, and helpers for testing across the monorepo.

## Features

- **Mock Provider**: Simulated LLM provider with configurable failure modes
- **Test Fixtures**: Pre-built test data for common scenarios
- **Assertion Helpers**: Custom assertions for OpenCode-specific patterns

## Usage

```javascript
import { MockProvider, createTestContext } from 'opencode-test-utils';

const provider = new MockProvider('test-provider', {
  models: ['test-model'],
  shouldFail: false,
  failAt: 5,  // Fail after 5 calls
});

const response = await provider.call('test prompt');
console.log(response.text); // "Response from test-provider"

provider.reset(); // Reset call count
```

## API

### `MockProvider`

| Method | Description |
|--------|-------------|
| `call(prompt)` | Simulate a provider call |
| `reset()` | Reset call count and failure state |

### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `models` | `string[]` | `['test-model']` | Available model names |
| `shouldFail` | `boolean` | `false` | Always fail on call |
| `failAt` | `number` | `Infinity` | Fail after N calls |

## License

MIT
