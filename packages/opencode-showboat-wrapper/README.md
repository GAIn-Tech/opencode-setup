# opencode-showboat-wrapper

High-impact evidence capture orchestrator. Generates machine-readable proof documents for significant task completions using Playwright assertions.

## Features

- **High-Impact Gating**: Only captures evidence for major milestones
- **Playwright Assertions**: Default evidence method using browser automation
- **Markdown Proof Documents**: Machine-readable verification output
- **Zero-Human Verification**: Fully automated evidence generation

## Usage

```javascript
const { ShowboatWrapper } = require('opencode-showboat-wrapper');

const showboat = new ShowboatWrapper({
  outputDir: '.sisyphus/evidence',
  playwrightAsDefault: true,
});

// Capture evidence for a high-impact task
const evidence = await showboat.capture({
  task: 'Deploy production database migration',
  impact: 'high',
  assertions: [
    { type: 'status', expected: 200 },
    { type: 'content', selector: '.success-message' },
  ],
});
```

## API

### `new ShowboatWrapper(config)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `outputDir` | `string` | `'.sisyphus/evidence'` | Evidence output directory |
| `playwrightAsDefault` | `boolean` | `true` | Use Playwright for assertions |
| `highImpactThreshold` | `object` | See source | Criteria for high-impact detection |

### Methods

| Method | Description |
|--------|-------------|
| `capture(taskContext)` | Capture evidence for a task |
| `isHighImpact(taskContext)` | Check if task meets high-impact threshold |
| `generateReport(evidencePath)` | Generate summary from evidence file |

## License

MIT
