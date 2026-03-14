# CLI and MCP Surface Policy

**Purpose**: Define when an opencode package should be exposed as CLI-first, MCP-first, hybrid, or library-only.

**Last Updated**: 2026-03-13  
**Status**: Active guidance

---

## Why This Exists

OpenCode is increasingly used in CLI-centric development environments, but that does not make CLI the right public surface for every internal service.

Use this policy to decide the right surface before adding a new wrapper.

- Prefer CLI when the workload is command-oriented, batch-friendly, or process-management heavy.
- Prefer MCP when the workload is agent-callable, typed, discoverable, and valuable across host clients.
- Use both only when each surface serves a distinct workflow.
- Keep packages library-only when the public contract is still too broad, stateful, or internal.

This policy follows two evidence sources:

1. External tooling trend: terminal-native agents are making CLI a stronger execution substrate for local developer workflows.
2. Repo structure: this monorepo already uses thin adapters over library cores, and the current packages split cleanly by operational shape.

---

## Default Architecture

Use this layering by default:

```text
library core -> optional CLI entrypoint -> optional stdio MCP wrapper
```

Guidance:

- Put domain logic in the library core.
- Add a CLI only if a human or script has a natural shell-facing workflow.
- Add an MCP wrapper only if an agent or host client benefits from typed tool access.
- Do not make transport decisions before defining the narrow public contract.

---

## Decision Rubric

Answer these questions in order before exposing a package:

1. Is there a narrow public contract, or only an internal API?
2. Would a human actually want to run this from a shell?
3. Would an agent benefit from typed tool discovery more than shell execution?
4. Is the workload batch/process oriented or advisory/query oriented?
5. Does it need cross-client portability and host integration?
6. Does exposure create auth, state, or concurrency risk?
7. Would a second surface add distinct value, or only duplicate maintenance?

Decision rule:

- Choose **CLI-first** when shell ergonomics, batch use, CI use, or process control dominate.
- Choose **MCP-first** when typed tool calls, discoverability, and host portability dominate.
- Choose **Hybrid** only when CLI and MCP serve different real workflows.
- Choose **Library-only** when the contract is still internal, broad, or unstable.

---

## Surface Types

### CLI-first

Use CLI-first when the package looks like a command.

Good signals:

- Subcommands, flags, file paths, or explicit output formats
- Batch processing or CI automation value
- Deterministic side effects such as process launch, export, sync, or cleanup
- Strong local shell composability

### MCP-first

Use MCP-first when the package looks like a host-facing agent capability.

Good signals:

- Small typed operations with structured results
- Advisory or lookup-style workflows
- Value from tool discovery and cross-client reuse
- Better fit as request/response calls than shell sessions

### Hybrid

Use hybrid only when both surfaces are independently justified.

Required:

- One strong human or script workflow for CLI
- One strong host-agent workflow for MCP
- Shared library core under both surfaces

### Library-only

Keep packages library-only when exposure would be premature.

Good signals:

- Broad orchestration surface
- Heavy internal coupling
- Live mutable state with unclear public ownership
- No intentionally narrow operator contract yet

---

## Current Package Matrix

| Package | Current Evidence | Recommended Surface | Rationale |
| ------- | ---------------- | ------------------- | --------- |
| `packages/opencode-memory-graph/` | Has both `src/cli.js` and `src/mcp-server.mjs` | Hybrid | Batch log parsing and export are natural CLI workflows; runtime graph queries are valid MCP workflows. |
| `packages/opencode-dashboard-launcher/` | Has `src/cli.js`; dormant for MCP in config policy | CLI-first | Process launch, stop, status, and browser open are command-oriented side effects, not a strong host-tool contract. |
| `packages/opencode-context-governor/` | Has `src/mcp-server.mjs` over `Governor` library | MCP-first | Budget checks and token accounting are advisory, typed, request/response operations that fit host agent calls better than shell commands. |
| `packages/opencode-runbooks/` | Has `src/mcp-server.mjs` over `Runbooks` library | MCP-first | Error matching, diagnosis, and remedy lookup are structured agent-callable operations with clear tool semantics. |
| `packages/opencode-model-router-x/` | Library-first only; no CLI entrypoint and no narrow public wrapper | Library-only | Routing is orchestration-heavy, stateful, and integration-coupled; design a smaller operator contract before exposing any transport. |

---

## Package Evidence

### opencode-memory-graph

- `packages/opencode-memory-graph/src/cli.js` already exposes a real shell workflow with output formats and file-path inputs.
- `packages/opencode-memory-graph/src/mcp-server.mjs` exposes graph-building and graph-query tools for host use.
- Conclusion: keep both surfaces because they serve different workflows.

### opencode-dashboard-launcher

- `packages/opencode-dashboard-launcher/src/cli.js` exposes `start`, `stop`, `status`, and `restart`.
- `packages/opencode-dashboard-launcher/src/index.js` is primarily process and browser lifecycle management.
- `opencode-config/mcp-dormant-policy.json` already treats its MCP exposure as dormant.
- Conclusion: keep this CLI-first unless a narrowly scoped read-only host contract appears.

### opencode-context-governor

- `packages/opencode-context-governor/src/index.js` exports a stateful `Governor` API for budget checks, usage recording, and session inspection.
- `packages/opencode-context-governor/src/mcp-server.mjs` exposes those operations as thin typed tools.
- Conclusion: keep MCP-first for host-facing use; add CLI only if a clear scripting workflow appears.

### opencode-runbooks

- `packages/opencode-runbooks/src/index.js` exposes deterministic diagnostic and remedy methods.
- `packages/opencode-runbooks/src/mcp-server.mjs` maps them directly into structured tools.
- Conclusion: keep MCP-first because the natural workflow is in-band agent diagnosis rather than standalone shell use.

### opencode-model-router-x

- `packages/opencode-model-router-x/src/index.js` is a large internal routing surface with policy, health, learning, and fallback concerns.
- `packages/opencode-model-router-x/package.json` exposes a library entrypoint only.
- Conclusion: do not force either CLI or MCP yet; first define a narrow operator-facing surface, likely read-only metrics before control paths.

---

## Policy for Future Packages

Before adding any new wrapper:

1. Define the public contract in the library layer.
2. Classify the workload as command, advisory tool, both, or internal-only.
3. Prove the target workflow with one concrete user journey.
4. Reject duplicate surfaces unless each one has its own operator value.
5. Keep host-facing MCP pools focused; do not expose internal specialist infrastructure by default.

Anti-patterns:

- Adding a CLI only because the ecosystem is becoming more terminal-native
- Adding an MCP wrapper only because a package is technically callable
- Exposing orchestration-heavy internals before narrowing the contract
- Maintaining two public surfaces that only mirror each other

---

## Wrapper Review Checklist

Use this checklist in review before adding or approving a new public surface.

| Check | Pass Condition |
| ----- | -------------- |
| Public contract | The package exposes a narrow, intentional contract instead of raw internal methods. |
| Workflow proof | There is one concrete operator or agent workflow that justifies the surface. |
| Surface choice | The proposal explicitly explains why it is CLI-first, MCP-first, hybrid, or library-only. |
| No duplicate surface | If both CLI and MCP are proposed, each serves a distinct workflow. |
| State risk | Auth, mutable state, and concurrency risks are named and acceptable. |
| Library core | Business logic lives in the library layer, not duplicated in wrappers. |
| Host exposure | Internal specialist infrastructure is not added to the host-facing pool by default. |

---

## Bottom Line

CLI is the default execution substrate for many modern development workflows, but it is not the default answer for every OpenCode service.

- Use CLI for commands.
- Use MCP for agent-callable tools.
- Use both only when both are real.
- Keep unstable orchestration surfaces internal.

That policy preserves CLI momentum without giving up the typed, discoverable, cross-client benefits that still make MCP strategically useful.
