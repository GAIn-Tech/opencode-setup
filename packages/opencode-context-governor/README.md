# opencode-context-governor

Active token budget controller for OpenCode sessions. Tracks per-model, per-session token consumption with configurable warn/error thresholds.

## Install

```bash
npm install ./packages/opencode-context-governor
# or link globally
npm link
```

## Usage

```js
const { Governor } = require('opencode-context-governor');

const gov = new Governor();
// Or with custom persist path:
// const gov = new Governor({ persistPath: '/tmp/budgets.json' });

const session = 'ses_abc123';
const model = 'anthropic/claude-opus-4-6';

// Check before consuming
const check = gov.checkBudget(session, model, 5000);
// => { allowed: true, status: 'ok', remaining: 175000, message: 'OK: 5000/180000 tokens (2.8%).' }

if (check.allowed) {
  const result = gov.consumeTokens(session, model, 5000);
  // => { used: 5000, remaining: 175000, pct: 0.0278, status: 'ok' }
}

// Query remaining budget
const budget = gov.getRemainingBudget(session, model);
// => { remaining: 175000, used: 5000, max: 180000, pct: 0.0278, status: 'ok' }

// Reset a session
gov.resetSession(session);
```

## Model Budgets

| Model | Max Tokens | Provider |
|-------|-----------|----------|
| anthropic/claude-opus-4-6 | 180,000 | Anthropic |
| anthropic/claude-sonnet-4-5 | 200,000 | Anthropic |
| anthropic/claude-haiku-4-5 | 90,000 | Anthropic |
| gpt-5 | 100,000 | OpenAI |
| gpt-5-mini | 100,000 | OpenAI |
| gemini-2.5-pro | 1,000,000 | Google |

Unknown models default to 100,000 tokens.

## Thresholds

- **75%** usage: `warn` status
- **90%** usage: `error` status
- **100%** usage: `exceeded` — `checkBudget()` returns `allowed: false`

## Persistence

State auto-saves to `~/.opencode/session-budgets.json` after each `consumeTokens()` call. Manual control:

```js
gov.saveToFile('/custom/path.json');
gov.loadFromFile('/custom/path.json');
```

## API

### `Governor`

- `checkBudget(sessionId, model, proposedTokens)` — advisory check, returns `{ allowed, status, remaining, message }`
- `consumeTokens(sessionId, model, count)` — record usage, returns `{ used, remaining, pct, status }`
- `getRemainingBudget(sessionId, model)` — query budget, returns `{ remaining, used, max, pct, status }`
- `getAllSessions()` — summary of all tracked sessions
- `resetSession(sessionId, [model])` — clear tracking data
- `loadFromFile(path)` / `saveToFile(path)` — manual persistence
- `Governor.getModelBudgets()` — static, returns all model configs
