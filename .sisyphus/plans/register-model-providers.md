# Plan: Register Model Providers in UI Registry

## TL;DR

> **Quick Summary**: Register NVIDIA, Groq, and Cerebras in the central `opencode-config/opencode.json` provider block to make their models visible in the OpenCode selection UI (Ctrl+P).
> 
> **Deliverables**: 
> - Updated `opencode-config/opencode.json` with new provider and model definitions.
> 
> **Estimated Effort**: Quick
> **Parallel Execution**: NO - sequential config update
> **Critical Path**: Update opencode.json

---

## Context

### Original Request
"I'm not seeing our models/providers that we added to the env file in the available models for selection after i do control p and select model sin opencode. We are already authed for antigravity and openai and anthropic so we don't need those, and I didn't do sambanova, but the rest I gave multiple keys for."

### Interview Summary
**Key Discussions**:
- [Registry]: The OpenCode UI populates from the `provider` section in `opencode-config/opencode.json`.
- [Providers]: NVIDIA, Groq, and Cerebras are configured in `.env` but missing from the UI.
- [Router]: `opencode-model-router-x` already contains the necessary model metadata in `policies.json`.

**Research Findings**:
- `opencode.json` currently only defines the `google` provider.
- Model IDs needed: `nvidia/llama-3.1-405b`, `groq/llama-3.1-70b`, `cerebras/llama-3.1-70b`.

### Metis Review
**Identified Gaps** (addressed):
- [Verification]: Added explicit `jq` validation and `ModelRouter` availability check to ensure registration is successful and router-compatible.
- [Scope]: Strictly limited to `opencode.json` additions as requested.

---

## Work Objectives

### Core Objective
Enable visibility of NVIDIA, Groq, and Cerebras models in the OpenCode selection UI.

### Concrete Deliverables
- `opencode-config/opencode.json`

### Definition of Done
- [ ] `opencode.json` contains entries for `nvidia`, `groq`, and `cerebras`.
- [ ] `jq` validation passes for the new schema.
- [ ] `ModelRouter` recognizes the new providers as available.

### Must Have
- Exact model IDs matching `policies.json`.
- Limits (context/output) matching provider specifications.

### Must NOT Have (Guardrails)
- NO changes to `packages/opencode-model-router-x/src/policies.json` (already complete).
- NO changes to `.env` file (already configured).
- NO new abstractions or validation logic.

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL verification is executed by the agent using tools (jq, bun).

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: None (Config update only)
- **Framework**: jq / bun

### Agent-Executed QA Scenarios

Scenario: Validate opencode.json schema syntax
  Tool: Bash (jq)
  Preconditions: None
  Steps:
    1. Run: `jq . opencode-config/opencode.json`
  Expected Result: Valid JSON output
  Evidence: Terminal output

Scenario: Verify new providers are in the registry
  Tool: Bash (jq)
  Preconditions: None
  Steps:
    1. Run: `jq '.provider | keys' opencode-config/opencode.json`
  Expected Result: Output array contains "google", "nvidia", "groq", "cerebras"
  Evidence: Terminal output

Scenario: Verify ModelRouter identifies new providers
  Tool: Bash (bun)
  Preconditions: .env file loaded
  Steps:
    1. Run a one-liner script to instantiate ModelRouter and check `this.rotators` keys.
    2. Assert: keys include "nvidia", "groq", "cerebras".
  Expected Result: Router correctly maps providers to rotators
  Evidence: Terminal output

---

## TODOs

- [x] 1. Register new providers in `opencode-config/opencode.json`

  **What to do**:
  - Add `nvidia`, `groq`, and `cerebras` to the `provider` block.
  - Use `@ai-sdk/openai` as the `npm` package (OpenAI-compatible).
  - Define models:
    - `nvidia`: `llama-3.1-405b` (context: 128000, output: 4096)
    - `groq`: `llama-3.1-70b` (context: 128000, output: 4096)
    - `cerebras`: `llama-3.1-70b` (context: 8192, output: 4096)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple JSON configuration update.
  - **Skills**: [`git-master`]
    - `git-master`: Required for standard commit workflow.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `opencode-config/opencode.json` - Target file and `google` provider template.
  - `packages/opencode-model-router-x/src/policies.json` - Source of truth for model metadata.

  **Acceptance Criteria**:
  - [ ] `jq '.provider | keys' opencode-config/opencode.json` includes ["nvidia", "groq", "cerebras"].
  - [ ] `jq '.provider.nvidia.models | keys' opencode-config/opencode.json` includes ["llama-3.1-405b"].

  **Commit**: YES
  - Message: `config: register nvidia, groq, and cerebras providers in opencode registry`
  - Files: `opencode-config/opencode.json`

---

## Success Criteria

### Verification Commands
```bash
jq '.provider | keys' opencode-config/opencode.json
```

### Final Checklist
- [ ] All 3 new providers registered.
- [ ] Models match policies.json naming exactly.
- [ ] JSON syntax is valid.
