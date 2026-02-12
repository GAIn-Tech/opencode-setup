# opencode-sisyphus-state

Durable execution layer for OpenCode agents, providing a SQLite-backed state machine with event sourcing, checkpoint/resume, and parallel execution capabilities.

## Features

- **Durable Execution**: All workflow steps are checkpointed to SQLite (`.sisyphus-state.db`).
- **Resilience**: Exponential backoff retries for failed steps.
- **Resume Capability**: Resume execution from the last successful checkpoint after a crash.
- **Parallel Execution**: Support for `parallel-for` steps with fan-out/fan-in.
- **Integrations**: Built-in wrappers for Governor, Router-X, SkillRL, and Showboat.

## Usage

```javascript
const { WorkflowStore, WorkflowExecutor } = require('opencode-sisyphus-state');

// Initialize store (WAL mode enabled)
const store = new WorkflowStore('./workflow.db');

// Initialize executor with custom handlers
const executor = new WorkflowExecutor(store, {
  'my-step': async (input, context) => {
    return { result: 'success' };
  }
});

// Define workflow
const workflow = {
  name: 'my-workflow',
  steps: [
    { id: 'step1', type: 'my-step', retries: 3 }
  ]
};

// Execute (returns promise)
await executor.execute(workflow, { initial: 'data' });

// Resume
await executor.resume(runId, workflow);
```

## Schema

- `workflow_runs`: Tracks overall execution status.
- `workflow_steps`: Tracks individual step status, results, and retry attempts.
- `audit_events`: Log of all transitions and custom events.
