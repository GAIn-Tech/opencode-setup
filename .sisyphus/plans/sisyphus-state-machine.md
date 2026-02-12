# Plan: opencode-sisyphus-state

## Core Objective
Implement a durable execution wrapper for the OpenCode agentic stack. `opencode-sisyphus-state` provides an event-sourced state machine that ensures workflows can survive process crashes, budget overruns, and model failures without losing progress.

## Deliverables
- `WorkflowExecutor`: Core class for orchestrating steps with persistence.
- `SQLite Store`: Schema for runs, steps, results, and audit events.
- `Integration Handlers`: Wrappers for existing 13-package stack.
- `Recovery Suite`: Automated tests for crash-resume scenarios.

## Constraints
- **Database**: SQLite (better-sqlite3) with WAL mode.
- **Duality**: State-based checkpoints + Append-only audit log.
- **Idempotency**: Step recording must be idempotent via `INSERT OR REPLACE` on `(run_id, step_id)`.
- **Environment**: Node.js/Bun.

## Step-by-Step Execution

### Phase 1: Scaffold & Initialize
- [ ] 1. Create `packages/opencode-sisyphus-state` directory.
- [ ] 2. Initialize `package.json` with `better-sqlite3` and `uuid`.
- [ ] 3. Create `src/database.js` with WAL mode and `busy_timeout` configuration.

### Phase 2: Schema & Audit Log
- [ ] 4. Implement `workflow_runs` table (id, name, status, context).
- [ ] 5. Implement `workflow_steps` table (run_id, step_id, status, result, attempts).
- [ ] 6. Implement `audit_events` table (id, run_id, type, payload, timestamp).

### Phase 3: Workflow Executor (Core)
- [ ] 7. Implement `WorkflowExecutor` class.
- [ ] 8. Implement `execute(workflowDef, input)`:
    - Intent: Record start of run.
    - Loop: Check if step completed, execute if not, checkpoint result.
- [ ] 9. Ensure atomicity of step checkpoints via transactions.

### Phase 4: Resilience & Retries
- [ ] 10. Implement `resume(runId)` to pick up from last `completed` or `failed` step.
- [ ] 11. Implement exponential backoff retry logic for transient failures.

### Phase 5: Integration Wrappers
- [ ] 12. Implement `executeStep` handlers:
    - `governor`: Check budget/consume.
    - `router-x`: Select model/record outcome.
    - `skill-rl`: Select skills/penalize failure.
    - `showboat`: Trigger evidence on milestone.

### Phase 6: Verification
- [ ] 13. Create `tests/durability.test.js`:
    - Scenario: Kill process mid-execution.
    - Expectation: `resume()` restarts from correct checkpoint.
- [ ] 14. Update `COMPLETE-INVENTORY.md` and `INTEGRATION-GUIDE.md`.

### Phase 7: Parallel Execution & CI/CD
- [ ] 15. Implement parallel task fan-out/fan-in support in `WorkflowExecutor`.
- [ ] 16. Create `.github/workflows/opencode-ci.yml` for automated system validation.

## Verification Strategy
- **Unit Tests**: `bun test` for core state machine logic.
- **Durability Tests**: Manual/automated process kill and restart verification.
- **Integration**: E2E run of a multi-step workflow involving Governor and SkillRL.
- **CI/CD**: Verify GitHub Action correctly runs tests and `opencode-eval`.

## Success Criteria
- [ ] `WorkflowExecutor` survives hard crash and resumes without double-executing completed steps.
- [ ] Audit log correctly records every state transition.
- [ ] 100% test pass rate for integration handlers.
- [ ] Documentation reflects the new durability layer.
