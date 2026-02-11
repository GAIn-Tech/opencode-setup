# opencode-fallback-doctor

Validates OpenCode fallback model chains. Checks syntax, model existence, ordering (Anthropic-primary), and duplicates. Diagnostic only — never modifies config.

## Install

```bash
npm install -g opencode-fallback-doctor
```

## API Usage

```js
const { FallbackDoctor } = require('opencode-fallback-doctor');

const doctor = new FallbackDoctor();

// Diagnose a config object
const result = doctor.diagnose({
  models: [
    'anthropic/claude-opus-4',
    'anthropic/claude-sonnet-4',
    'anthropic/claude-3.5-haiku',
    'openai/gpt-5',
    'google/gemini-2.5-pro',
    'kimi/k2.5',
  ]
});

console.log(result.healthy);       // true
console.log(result.issues);        // []
console.log(result.suggestions);   // ['No issues found...']

// Validate chain directly
const chain = doctor.validateChain(['openai/gpt-5', 'anthropic/claude-sonnet-4']);
// chain.valid === false (Anthropic must come first)

// Get fix suggestions
const fixes = doctor.suggestFix(chain.issues);
// ['Reorder chain: place all Anthropic models first...']

// Formatted report
console.log(doctor.report());
```

## CLI Usage

```bash
# Inline models
fallback-doctor --models anthropic/claude-sonnet-4,openai/gpt-5,google/gemini-2.5-pro

# From JSON file
fallback-doctor config.json

# Pipe JSON
echo '{"models":["anthropic/claude-sonnet-4","openai/gpt-5"]}' | fallback-doctor

# List known models
fallback-doctor --list
fallback-doctor --list anthropic
```

Exit code: `0` = healthy, `1` = issues found.

## Validation Rules

| Check | Severity | Description |
|-------|----------|-------------|
| Syntax | error | Model name must be `provider/model` format |
| Existence | warning | Model must be in known registry |
| Ordering | error | Anthropic models first (Opus → Sonnet → Haiku) |
| Duplicates | error | No duplicate models in chain |
| Chain length | warning | At least 3 models recommended |

## Part of OpenCode Ops Toolkit

One of 8 packages extracted from the monolithic ops kit. Standalone — zero dependencies.
