# opencode-model-router-x

Policy-based model router with live outcome tuning for OpenCode.

Selects the optimal LLM model for a task based on complexity, cost tier, provider preference (Anthropic-primary), and live success/latency tracking.

## Install

```bash
cd ~/packages/opencode-model-router-x
npm link
```

## Usage

```js
const { ModelRouter } = require('opencode-model-router-x');

const router = new ModelRouter();

// Select model for a high-complexity task
const pick = router.selectModel({ complexity: 'high' });
console.log(pick);
// {
//   model: 'anthropic/claude-opus-4-6',
//   score: 0.812,
//   reason: 'provider=anthropic(w0.6); tier-match; pref-1st; sr=92%',
//   cost_tier: 'high',
//   fallbacks: ['gpt-4o', 'gemini-3-pro', 'anthropic/claude-sonnet-4-5']
// }

// Record outcomes to tune future selections
router.recordOutcome('anthropic/claude-opus-4-6', true, 1450);
router.recordOutcome('anthropic/claude-opus-4-6', true, 980);
router.recordOutcome('gpt-5', false, 5200);

// Simple task → routes to Haiku
const simple = router.selectModel({ complexity: 'simple' });
console.log(simple.model); // 'anthropic/claude-haiku-4-5'

// With strength requirements
const pick2 = router.selectModel({
  complexity: 'high',
  required_strengths: ['long-context'],
});
console.log(pick2.model); // may prefer gemini-3-pro

// Export/import state for persistence
const state = router.exportState();
// ... save to disk ...
const router2 = new ModelRouter();
router2.importState(state);
```

## API

### `new ModelRouter(options?)`

- `options.policies` — Override default `policies.json`
- `options.initialStats` — Pre-seed outcome history

### `router.selectModel(context)`

- `context.complexity` — `'simple'` | `'moderate'` | `'high'` | `'critical'`
- `context.cost_tier` — Override cost tier directly
- `context.required_strengths` — e.g. `['debugging', 'long-context']`
- `context.max_latency_ms` — Hard latency ceiling

Returns `{ model, score, reason, cost_tier, fallbacks }`.

### `router.recordOutcome(modelId, success, latencyMs?)`

Feed live outcomes. Uses exponential decay so recent results matter more.

### `router.getModelStats(modelId)` / `router.getAllStats()`

Inspect live success rates and latency averages.

### `router.exportState()` / `router.importState(state)`

Persist and restore tuning data across sessions.

## Cost Tiers

| Tier | Budget | Routes To |
|------|--------|-----------|
| mechanical | $0.02 | haiku/speed |
| trivial | $0.05 | haiku/speed |
| low | $0.10 | sonnet/balanced |
| medium | $0.25 | sonnet/balanced |
| high | $0.50 | opus/flagship |
| critical | $1.00 | opus/flagship |
| emergency | $2.00 | opus/flagship |

## Scoring

Models are scored on a 0–1 composite:
- **25%** Provider weight (Anthropic 0.6, others 0.4)
- **20%** Tier match (speed/balanced/flagship vs cost tier)
- **25%** Preference list position (from complexity routing)
- **20%** Live success rate (blended default + observed)
- **10%** Strength match bonus
- Penalties for over-budget and high latency

## License

MIT
