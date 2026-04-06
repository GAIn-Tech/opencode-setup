# opencode-delegation-liveness

Delegation liveness detection and progress tracking for OpenCode.

## Purpose

This module provides the contract for detecting stalled delegations, tracking progress signals, and classifying task states. It addresses the gap identified in the ecosystem audit where plugin heartbeat was conflated with task progress.

## Installation

```bash
cd packages/opencode-delegation-liveness
bun install
```

## Task State Classification

| State | Description |
|-------|-------------|
| `healthy` | Task is making progress |
| `slow` | Task is running but slower than expected |
| `stalled` | No progress detected within timeout |
| `failed` | Task has failed |
| `waiting-on-human` | Task is blocked waiting for human input |
| `unknown` | State cannot be determined |

## Progress Signals

| Signal | Description |
|--------|-------------|
| `tool-invocation` | A tool was invoked |
| `file-read` | A file was read |
| `file-write` | A file was written |
| `bash-command` | A bash command was executed |
| `browser-action` | A browser action was performed |
| `heartbeat` | Generic heartbeat signal |
| `status-update` | Status was updated |
| `subagent-spawn` | A subagent was spawned |
| `subagent-complete` | A subagent completed |
| `error` | An error occurred |
| `human-input-required` | Waiting for human input |

## Category-Specific Timeouts

| Category | Timeout | Slow Threshold |
|----------|---------|----------------|
| quick | 30s | 50% (15s) |
| unspecified-low | 60s | 60% (36s) |
| deep | 5min | 70% (3.5min) |
| ultrabrain | 10min | 80% (8min) |
| visual-engineering | 3min | 60% (1.8min) |
| artistry | 5min | 60% (3min) |
| unspecified-high | 5min | 60% (3min) |
| writing | 2min | 60% (1.2min) |

## Usage

### ProgressTracker

Track progress for a single delegation:

```javascript
const { ProgressTracker, PROGRESS_SIGNALS } = require('opencode-delegation-liveness');

const tracker = new ProgressTracker({
  taskId: 'task-123',
  category: 'deep'
});

// Record progress
tracker.recordProgress(PROGRESS_SIGNALS.TOOL_INVOCATION, { tool: 'read' });
tracker.recordProgress(PROGRESS_SIGNALS.FILE_READ, { path: '/src/index.js' });

// Evaluate state
const state = tracker.evaluateState();
console.log(state);
// { state: 'healthy', reason: 'progress-observed', elapsed: 150, sinceProgress: 50 }
```

### LivenessDetector

Manage multiple delegations:

```javascript
const { LivenessDetector, PROGRESS_SIGNALS } = require('opencode-delegation-liveness');

const detector = new LivenessDetector();

// Start tracking
detector.startTracking('task-1', { category: 'quick' });
detector.startTracking('task-2', { category: 'deep' });

// Record progress
detector.recordProgress('task-1', PROGRESS_SIGNALS.HEARTBEAT);

// Evaluate all
const results = detector.evaluateAll();

// Get stalled tasks
const stalled = detector.getStalledTasks();

// Get slow tasks
const slow = detector.getSlowTasks();
```

### classifyTaskState

Pure function for state classification:

```javascript
const { classifyTaskState } = require('opencode-delegation-liveness');

const result = classifyTaskState({
  category: 'deep',
  elapsed: 180000,      // 3 minutes
  sinceProgress: 30000, // 30 seconds since last progress
  hasError: false,
  waitingOnHuman: false
});

console.log(result);
// { state: 'healthy', reason: 'progress-observed' }
```

## Edge Cases Handled

- **Long-running quiet tasks**: Classified as `slow` before timeout, not immediately stalled
- **Rate-limited tasks**: Not misclassified as stalled if progress is recent
- **Brownout scenarios**: Intermittent progress classified as `slow`
- **Concurrent sessions**: Each tracked independently

## Testing

```bash
bun test
```

## Related

- Task 4 of ecosystem-audit-improvements.md
- `packages/opencode-plugin-lifecycle/` - Plugin health (different concern)
- Task 5 - Implementation of no-progress detection using this spec
