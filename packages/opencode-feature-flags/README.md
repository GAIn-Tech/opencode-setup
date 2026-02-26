# opencode-feature-flags

Feature flag system for OpenCode. Enables gradual rollouts, A/B testing, and safe feature releases.

## Features

- **Gradual Rollouts**: Percentage-based feature activation
- **A/B Testing**: Split traffic between variants
- **Safe Releases**: Disable features instantly without deployment
- **User Targeting**: Target specific users or groups
- **Overrides**: Manual override for testing

## Installation

```bash
bun install opencode-feature-flags
```

## Usage

### Basic Feature Flag

```javascript
import { createFeatureFlags } from 'opencode-feature-flags';

const flags = createFeatureFlags({
  newDashboard: {
    enabled: true,
    rolloutPercentage: 50
  }
});

if (flags.isEnabled('newDashboard', userId)) {
  // Show new dashboard
}
```

### A/B Testing

```javascript
const variant = flags.getVariant('experiment-123', userId, ['control', 'treatment']);
// variant is either 'control' or 'treatment'
```

## API

### `createFeatureFlags(config)`

Create feature flag manager.

- `config`: Object with feature definitions
- Returns: FeatureFlagManager

### `isEnabled(flagName, userId)`

Check if feature is enabled for user.

### `getVariant(experiment, userId, variants)`

Get A/B test variant.

## Testing

```bash
bun test
```

## License

MIT
