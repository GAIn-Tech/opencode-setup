# opencode-learning-engine

Learns from opencode sessions to improve orchestration decisions. **Heavily weighted toward anti-pattern detection and avoidance.**

## Philosophy

> Avoiding known failures is more valuable than repeating successes.

- Anti-pattern warnings are **STRONG** (should block or pause the agent)
- Positive pattern suggestions are **SOFT** (agent can freely ignore)
- This asymmetry is intentional and non-negotiable

## Install

```bash
cd ~/packages/opencode-learning-engine
npm link
```

## Quick Start

```js
const { LearningEngine } = require('opencode-learning-engine');

const engine = new LearningEngine();

// Ingest all sessions
const result = engine.ingestAllSessions();
console.log(`Found ${result.total_anti} anti-patterns, ${result.total_positive} positive patterns`);

// Get advice before starting a task
const advice = engine.advise({
  task_type: 'debug',
  files: ['src/api/handler.ts'],
  error_type: 'TypeError',
  attempt_number: 3,
});

if (advice.should_pause) {
  console.warn('HIGH RISK — review warnings before proceeding:');
  for (const w of advice.warnings) {
    console.warn(`  [${w.severity}] ${w.type}: ${w.description}`);
    console.warn(`  Advice: ${w.advice}`);
  }
}

console.log('Suggested agent:', advice.routing.agent);
console.log('Suggested skills:', advice.routing.skills);

// After task completes, record outcome for learning
engine.learnFromOutcome(advice.advice_id, {
  success: false,
  failure_reason: 'Same TypeError persisted after edit',
  tokens_used: 15000,
});

// View report
console.log(JSON.stringify(engine.getReport(), null, 2));
```

## API

### Package Exports

```js
const {
  LearningEngine,
  AntiPatternCatalog,
  PositivePatternTracker,
  PatternExtractor,
  OrchestrationAdvisor,
  ANTI_PATTERN_TYPES,
  POSITIVE_PATTERN_TYPES,
  SEVERITY_WEIGHTS,
  AGENT_CAPABILITIES,
  SKILL_AFFINITY,
} = require('opencode-learning-engine');
```

`LearningEngine` now extends Node's `EventEmitter` for integration hooks.

### `LearningEngine`

Main entry point. Wraps all components.

| Method | Description |
|--------|-------------|
| `ingestSession(sessionId)` | Parse a single session's logs |
| `ingestAllSessions()` | Parse all sessions + cross-session analysis |
| `advise(taskContext)` | Get warnings + suggestions + routing |
| `learnFromOutcome(adviceId, outcome)` | Record success/failure for learning |
| `addAntiPattern({type, description, severity, context})` | Manually add anti-pattern |
| `addPositivePattern({type, description, success_rate, context})` | Manually add positive pattern |
| `getReport()` | Comprehensive insights report |
| `save()` / `load()` | Persist/restore state |
| `registerHook(hookName, fn)` | Register extension callback |
| `unregisterHook(hookName, fn)` | Remove extension callback |

### Extension Hooks

Use either `engine.registerHook(name, fn)` or `engine.on(name, fn)`.

| Hook | When it fires | Payload |
|------|---------------|---------|
| `preOrchestrate` | Before `advise()` calls advisor | `{ task_context }` |
| `adviceGenerated` | After advisor response is produced | `{ task_context, advice }` |
| `patternStored` | Anti/positive pattern added (ingestion/manual) | `{ type, pattern, session_id? }` |
| `outcomeRecorded` | After `learnFromOutcome()` processes result | `{ advice_id, outcome, result }` |
| `onFailureDistill` | Failure-related pattern distilled | `{ advice_id?, outcome?, distilled_failure? }` |
| `hook:error` | Hook callback throws | `{ hook, payload, error }` |

### Anti-Pattern Types

| Type | Description | Severity |
|------|-------------|----------|
| `shotgun_debug` | Random edits without understanding root cause | high |
| `repeated_mistake` | Same error across 2+ sessions | critical |
| `inefficient_solution` | Excessive tokens for simple changes | medium |
| `wrong_tool` | Using grep+read when LSP/AST would work | medium |
| `type_suppression` | @ts-ignore, `any`, eslint-disable | high |
| `failed_debug` | Debug attempt that didn't resolve issue | medium |
| `broken_state` | Working while build/tests are failing | high |

### Positive Pattern Types

| Type | Description |
|------|-------------|
| `efficient_debug` | Fixed in single attempt (read → edit → verify) |
| `creative_solution` | Used AST/LSP tools for structural manipulation |
| `good_delegation` | Effectively used sub-agents |
| `clean_refactor` | Refactored with verification |
| `fast_resolution` | Completed in ≤5 messages |

### `advise(taskContext)` Input

```js
{
  task_type: 'debug',        // debug, refactor, feature, fix, test, etc.
  description: '...',        // Natural language
  files: ['src/foo.ts'],     // Files to be touched
  error_type: 'TypeError',   // If fixing an error
  attempt_number: 3,         // Which attempt
  tool: 'mcp_edit',          // Tool being considered
  action: '...',             // Action description
  complexity: 'moderate',    // trivial, simple, moderate, complex, extreme
}
```

### `advise()` Output

```js
{
  advice_id: 'adv_...',
  warnings: [                // STRONG — anti-pattern matches
    { type, description, severity, match_score, advice, strength: 'STRONG' }
  ],
  suggestions: [             // SOFT — positive pattern recommendations
    { type, description, success_rate, relevance, strength: 'SOFT' }
  ],
  routing: {
    agent: 'hephaestus',     // Recommended agent
    skills: ['systematic-debugging'],  // Recommended skills
    confidence: 0.72,
  },
  risk_score: 23.5,
  should_pause: true,        // true if risk_score > 15
}
```

## NPM Scripts

```bash
npm test      # Run basic smoke test
npm run report  # Print current learning report
npm run ingest  # Ingest all available sessions
```

## Data Storage

- Anti-patterns: `~/.opencode/learning/anti-patterns.json`
- Positive patterns: `~/.opencode/learning/positive-patterns.json`
- Session logs read from: `~/.opencode/messages/{session_id}/*.json`

## Integration

Feeds into **oh-my-opencode** agent selection. Can also feed data to **opencode-memory-graph** for session→error relationship tracking.

Standalone — no external dependencies required.
