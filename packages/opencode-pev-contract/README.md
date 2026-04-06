# opencode-pev-contract

Planner/Executor/Verifier/Critic contract interfaces for OpenCode orchestration.

## Overview

This package defines explicit contracts for the four PEV roles that form the backbone of OpenCode's orchestration architecture:

- **Planner** — Decomposes tasks into executable plans
- **Executor** — Executes plans and produces results
- **Verifier** — Verifies results against plans
- **Critic** — Evaluates multiple results and selects the best

## Why PEV?

Before this contract, OpenCode's orchestration roles were distributed across multiple components:
- `OrchestrationAdvisor` acted as a planner but had no formal contract
- `WorkflowExecutor` acted as an executor but had no formal contract
- `ShowboatWrapper` acted as a verifier but had no formal contract

The PEV contract makes these roles explicit, testable, and interchangeable.

## Installation

```bash
bun add opencode-pev-contract
```

## Usage

### Basic PEV Lifecycle

```javascript
import {
  PEVContract,
  PEVRole,
  Planner,
  Executor,
  Verifier,
  Plan,
  Result,
  Verification
} from 'opencode-pev-contract';

// 1. Create contract
const contract = new PEVContract();

// 2. Register role implementations
class MyPlanner extends Planner {
  decompose(taskContext) {
    return new Plan({
      taskId: taskContext.task_type,
      steps: [
        { id: 'step-1', type: 'read', description: 'Read source files' },
        { id: 'step-2', type: 'edit', description: 'Apply changes' },
        { id: 'step-3', type: 'verify', description: 'Run tests' }
      ]
    });
  }
}

class MyExecutor extends Executor {
  async execute(plan, context) {
    // Execute each step...
    return new Result({
      taskId: plan.taskId,
      planId: plan.taskId,
      success: true,
      outputs: { filesModified: 2 }
    });
  }
}

class MyVerifier extends Verifier {
  async verify(result, plan) {
    const passed = result.outputs.filesModified > 0;
    return new Verification({
      taskId: result.taskId,
      planId: result.planId,
      passed,
      methods: ['tests', 'static'],
      confidence: passed ? 0.95 : 0.0,
      details: { filesModified: result.outputs.filesModified }
    });
  }
}

contract.registerRole(PEVRole.PLANNER, new MyPlanner());
contract.registerRole(PEVRole.EXECUTOR, new MyExecutor());
contract.registerRole(PEVRole.VERIFIER, new MyVerifier());

// 3. Execute PEV lifecycle
if (contract.isReady()) {
  // Plan
  const plan = contract.planner.decompose({ task_type: 'debug' });
  console.log(contract.planner.validate(plan)); // true

  // Execute
  const result = await contract.executor.execute(plan, {});
  console.log(result.success); // true

  // Verify
  const verification = await contract.verifier.verify(result, plan);
  console.log(verification.passed); // true
}
```

### Lifecycle Events

```javascript
import { PEVContract, PEVLifecycleEvent } from 'opencode-pev-contract';

const contract = new PEVContract();

contract.onEvent((event) => {
  console.log(`${event.event}: ${JSON.stringify(event.payload)}`);
});

// Events emitted:
// - plan_created
// - plan_validated
// - execution_started
// - execution_completed
// - verification_started
// - verification_passed
// - verification_failed
// - critic_evaluated
```

### Validation

```javascript
import { validatePlan, validateResult, validateVerification } from 'opencode-pev-contract';

const planValidation = validatePlan({ taskId: 'task-1', steps: [{ id: 's1', type: 'read' }] });
console.log(planValidation.valid); // true

const resultValidation = validateResult({ taskId: 'task-1', planId: 'plan-1', success: true, outputs: {} });
console.log(resultValidation.valid); // true

const verificationValidation = validateVerification({
  taskId: 'task-1', planId: 'plan-1', passed: true, methods: ['tests'], confidence: 0.9
});
console.log(verificationValidation.valid); // true
```

## API

### Classes

| Class | Purpose | Abstract Methods |
|-------|---------|-----------------|
| `Plan` | Executable plan with steps | — |
| `Result` | Execution outcome | — |
| `Verification` | Verification outcome | — |
| `Planner` | Decomposes tasks into plans | `decompose(taskContext) => Plan` |
| `Executor` | Executes plans | `execute(plan, context) => Promise<Result>` |
| `Verifier` | Verifies results | `verify(result, plan) => Promise<Verification>` |
| `Critic` | Selects best result | `evaluate(results[]) => Promise<Result>` |
| `PEVContract` | Orchestrates PEV roles | — |

### Enums

| Enum | Values |
|------|--------|
| `PEVRole` | `planner`, `executor`, `verifier`, `critic` |
| `PEVLifecycleEvent` | `plan_created`, `plan_validated`, `execution_started`, `execution_completed`, `verification_started`, `verification_passed`, `verification_failed`, `critic_evaluated` |

### Validation Functions

| Function | Input | Returns |
|----------|-------|---------|
| `validatePlan(plan)` | Plan object | `{ valid: boolean, errors: string[] }` |
| `validateResult(result)` | Result object | `{ valid: boolean, errors: string[] }` |
| `validateVerification(verification)` | Verification object | `{ valid: boolean, errors: string[] }` |

## Integration with Existing Components

### OrchestrationAdvisor → Planner

```javascript
import { Planner, Plan } from 'opencode-pev-contract';
import { OrchestrationAdvisor } from 'opencode-learning-engine';

class AdvisorPlanner extends Planner {
  constructor(advisor) {
    super();
    this.advisor = advisor;
  }

  decompose(taskContext) {
    const advice = this.advisor.advise(taskContext);
    return new Plan({
      taskId: advice.advice_id,
      steps: advice.routing.skills.map((skill, i) => ({
        id: `step-${i}`,
        type: skill,
        description: `Apply ${skill} skill`,
        pe_role: 'executor'
      })),
      metadata: {
        risk_score: advice.risk_score,
        should_pause: advice.should_pause,
        routing: advice.routing
      }
    });
  }
}
```

### WorkflowExecutor → Executor

```javascript
import { Executor, Result } from 'opencode-pev-contract';
import { WorkflowExecutor } from 'opencode-sisyphus-state';

class WorkflowExecutorAdapter extends Executor {
  constructor(executor) {
    super();
    this.executor = executor;
  }

  async execute(plan, context) {
    const workflowDef = {
      name: plan.taskId,
      steps: plan.steps
    };

    const executionResult = await this.executor.execute(workflowDef, context);
    return new Result({
      taskId: plan.taskId,
      planId: plan.taskId,
      success: executionResult.status === 'completed',
      outputs: executionResult.context,
      metadata: { runId: executionResult.runId }
    });
  }
}
```

### ShowboatWrapper → Verifier

```javascript
import { Verifier, Verification } from 'opencode-pev-contract';
import { ShowboatWrapper } from 'opencode-showboat-wrapper';

class ShowboatVerifier extends Verifier {
  constructor(showboat) {
    super();
    this.showboat = showboat;
  }

  async verify(result, plan) {
    const evidence = this.showboat.captureEvidence({
      task: plan.taskId,
      filesModified: result.outputs?.filesModified || 0,
      outcome: result.success ? 'success' : 'failure',
      verification: { timestamp: new Date().toISOString() }
    });

    return new Verification({
      taskId: result.taskId,
      planId: result.planId,
      passed: result.success && evidence !== null,
      methods: evidence ? ['playwright', 'markdown'] : ['basic'],
      confidence: evidence ? 0.9 : (result.success ? 0.5 : 0.0),
      details: { evidencePath: evidence?.path }
    });
  }
}
```

## Testing

```bash
bun test
```

41 tests, 104 expect calls.
