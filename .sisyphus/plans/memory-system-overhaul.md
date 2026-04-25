# Memory System Overhaul: Unified Architecture

## TL;DR

> **Quick Summary**: Unify 3 siloed memory subsystems (Supermemory MCP, opencode-memory-graph, opencode-learning-engine) into a memory-first architecture where Supermemory is the canonical store, memory-graph serves as derived meta-memory, and the learning engine provides adaptive scoring. Add missing capabilities: importance scoring, consolidation protocol, temporal intelligence, and meta-memory.

> **Deliverables**:
> - Canonical memory schema with invariant enforcement
> - Unified memory write/recall bridge module
> - Deterministic scoring pipeline (recency + importance + relevance)
> - Consolidation script with dry-run, idempotency, and audit trail
> - Memory-graph as meta-memory layer (derived pointers only)
> - Degraded-mode fallback when Supermemory is unavailable
> - Platform-aware local path resolution (Windows-safe)

> **Estimated Effort**: Large
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Task 1 (Schema) → Task 4 (Write Bridge) → Task 8 (Consolidation) → Task 10 (Integration)

---

## Context

### Original Request

Overhaul the OpenCode memory system to address 6 critical gaps: no unified vector search, no consolidation protocol, 3 siloed stores with data drift, no importance scoring, no temporal intelligence, and no meta-memory layer.

### Interview Summary

**Key Discussions**:
- **Architecture**: Supermemory as canonical store; memory-graph and learning-engine hold only derived metadata with foreign keys back to Supermemory memory IDs
- **Scoring**: Mem0-style composite scoring (recency × recency_weight + importance × importance_weight + relevance × relevance_weight)
- **Consolidation**: Weekly automated with manual trigger; idempotent + reversible with dry-run support and audit trail
- **Path resolution**: Platform-aware via `os.homedir()` + `~/.opencode/memory/` (Windows-safe, not hardcoded)
- **Scope boundaries**: No replacing Supermemory, no new vector DB, no real-time sync, no UI dashboard, no agent protocol changes

**Research Findings**:
- **Mem0**: Entity-based memory with importance scoring and automated consolidation; production-proven pattern
- **Stanford Generative Agents**: Recency (exponential decay) + importance (LLM-rated) + relevance (cosine similarity) retrieval scoring
- **GraphRAG**: Community summaries for hierarchical memory; useful for consolidation phase
- **Letta/MemGPT**: Context window management with memory tiers (core/working/archival)

### Metis Review

**Identified Gaps** (addressed):
- **Canonical schema missing**: Added Task 1 to define memory record schema with minimum fields and invariants
- **Data ownership ambiguity**: Resolved — Supermemory is sole source of full-text content; graph/learning store only derived metadata + pointers
- **Consolidation destructive merge risk**: Mitigated with idempotency keys (content-hash + project + type), dry-run mode, audit trail, and provenance tracking
- **Scoring verifiability**: Mitigated with deterministic scoring function + logged feature breakdown per retrieval + test fixtures with exact expected values
- **Availability coupling**: Mitigated with degraded-mode fallback (queue locally if Supermemory down; disable consolidation safely)
- **Project-scoping**: Resolved — recall is project-scoped by default via `containerTag`; cross-project requires explicit opt-in

---

## Work Objectives

### Core Objective

Create a unified memory architecture where Supermemory is the single canonical store for all memory content, the memory-graph provides derived relationship/pattern metadata, and the learning-engine provides adaptive scoring weights — eliminating data drift between the 3 subsystems and adding missing intelligence capabilities.

### Concrete Deliverables

- `packages/opencode-integration-layer/src/memory-bridge.js` — Unified write/recall API
- `packages/opencode-integration-layer/src/memory-schema.js` — Canonical memory record schema + validation
- `packages/opencode-learning-engine/src/memory-scoring.js` — Deterministic scoring pipeline
- `packages/opencode-learning-engine/tests/memory-scoring.test.js` — Scoring test fixtures with exact expected values
- `scripts/memory-consolidate.mjs` — Consolidation CLI with --dry-run, --apply, --project, --format flags
- `packages/opencode-memory-graph/src/meta-memory-bridge.js` — Meta-memory pointer layer
- `packages/opencode-integration-layer/src/memory-degraded.js` — Degraded-mode fallback handler
- `packages/opencode-integration-layer/src/memory-paths.js` — Platform-aware path resolution
- `packages/opencode-learning-engine/src/temporal-intelligence.js` — Temporal intelligence layer
- `packages/opencode-learning-engine/src/adaptive-weights.js` — Adaptive weight optimizer

### Definition of Done

- [ ] `bun test packages/opencode-integration-layer/tests/` — all memory-related tests pass
- [ ] `bun test packages/opencode-learning-engine/tests/memory-scoring.test.js` — scoring tests pass with exact values
- [ ] `node scripts/memory-consolidate.mjs --dry-run --format json` — exits 0, produces idempotent JSON output
- [ ] `bun run governance:check` — no regressions
- [ ] Memory graph nodes reference only Supermemory IDs (no raw content stored in graph)

### Must Have

- Canonical memory schema with enforced invariants (id, type, project, agent, timestamp, importance, entities, source_session_id, content_hash, retention)
- Supermemory as sole full-text content store
- Deterministic scoring function with logged feature breakdown
- Idempotent consolidation with dry-run and audit trail
- Platform-aware local paths (`os.homedir()` + relative path)
- Degraded-mode when Supermemory unavailable

### Must NOT Have (Guardrails)

- NO new vector database — use Supermemory's built-in vector search
- NO real-time sync between subsystems — batch consolidation only
- NO UI/dashboard changes — backend-only
- NO agent protocol changes — transparent to agents
- NO replacing Supermemory with a different service
- NO storing full memory content in memory-graph or learning-engine
- NO hardcoded Unix paths — must use `os.homedir()` for Windows compatibility
- NO destructive consolidation without dry-run — all mutations must be previewable
- NO hand-wavy scoring without determinism — every score must be reproducible with same inputs
- NO shotgun debugging — use systematic-debugging skill if attempt_number >= 3 on same file

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.

### Test Decision

- **Infrastructure exists**: YES (bun test framework)
- **Automated tests**: YES (Tests-after) — scoring pipeline gets formal unit tests; other components verified via agent-executed QA
- **Framework**: bun test

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

Primary verification via Bash (bun test, node CLI) and bun test. Each task includes specific QA scenarios with exact commands, expected outputs, and evidence paths.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — Foundation):
├── Task 1: Canonical Memory Schema
├── Task 2: Degraded-Mode Fallback
└── Task 3: Platform-Aware Path Resolution

Wave 2 (After Wave 1 — Core Bridges):
├── Task 4: Unified Memory Write Bridge (depends: 1, 3)
├── Task 5: Deterministic Scoring Pipeline (depends: 1)
└── Task 6: Meta-Memory Pointer Layer (depends: 1, 3)

Wave 3 (After Wave 2 — Intelligence):
├── Task 7: Temporal Intelligence Layer (depends: 5)
├── Task 8: Consolidation Script (depends: 4, 5)
└── Task 9: Learning-Engine Adaptive Weights (depends: 5)

Wave 4 (After Wave 3 — Integration):
└── Task 10: End-to-End Integration + Regression (depends: 4, 6, 7, 8, 9)

Critical Path: Task 1 → Task 4 → Task 8 → Task 10
Parallel Speedup: ~45% faster than sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 4, 5, 6 | 2, 3 |
| 2 | None | 10 | 1, 3 |
| 3 | None | 4, 6 | 1, 2 |
| 4 | 1, 3 | 8, 10 | 5, 6 |
| 5 | 1 | 7, 8, 9 | 4, 6 |
| 6 | 1, 3 | 10 | 4, 5 |
| 7 | 5 | 10 | 8, 9 |
| 8 | 4, 5 | 10 | 7, 9 |
| 9 | 5 | 10 | 7, 8 |
| 10 | 4, 6, 7, 8, 9 | None | None (final) |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1, 2, 3 | task(category="ultrabrain", load_skills=["clean-architecture"]) × 3 parallel |
| 2 | 4, 5, 6 | task(category="ultrabrain", load_skills=["clean-architecture"]) × 3 parallel |
| 3 | 7, 8, 9 | task(category="unspecified-high", load_skills=["clean-architecture"]) × 3 parallel |
| 4 | 10 | task(category="ultrabrain", load_skills=["clean-architecture", "verification-before-completion"]) |

---

## TODOs

- [ ] 1. Define Canonical Memory Schema

  **What to do**:
  - Create `packages/opencode-integration-layer/src/memory-schema.js` defining the canonical memory record
  - Schema fields: `id` (UUID), `type` (enum: fact/preference/pattern/decision/error/session_context), `project` (string, containerTag), `agent` (string), `timestamp` (ISO 8601), `importance` (float 0-1, default 0.5), `entities` (string[]), `content` (string, full text), `content_hash` (SHA-256 hex), `source_session_id` (string), `retention` (enum: core/perishable/ephemeral), `metadata` (object, extensible)
  - Define invariants: `id` is immutable, `content_hash` must match `content`, `type` must be from enum, `project` is required, `timestamp` is auto-set on creation, `importance` clamped to [0,1]
  - Create validation function `validateMemoryRecord(record)` that returns `{valid, errors[]}`
  - Create `normalizeMemoryRecord(partial)` that fills defaults and computes `content_hash`
  - Create idempotency key function `computeIdempotencyKey(record)` = SHA-256(`content_hash` + `project` + `type`)
  - Export: `MEMORY_RECORD_SCHEMA`, `MEMORY_TYPES`, `RETENTION_POLICIES`, `validateMemoryRecord`, `normalizeMemoryRecord`, `computeIdempotencyKey`

  **Must NOT do**:
  - Do NOT store this schema in SQLite — it is a validation/normalization module only
  - Do NOT depend on Supermemory API — this is pure logic, no I/O
  - Do NOT add UI components or CLI surface

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
  - Reason: Schema design with invariants requires precise logical reasoning
  - **Skills**: [`clean-architecture`]
  - `clean-architecture`: Schema is a core domain model — must follow clean code principles
  - **Skills Evaluated but Omitted**:
  - `database-design`: Not creating a database schema, this is a JS validation module

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5, 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `packages/opencode-model-manager/src/lifecycle/audit-logger.js` — Immutable audit log pattern with hash chain integrity; follow this pattern for content_hash computation
  - `packages/opencode-learning-engine/src/index.js:134` — Core persistence rule (weight is ALWAYS 1.0 when persistence === 'core'); this maps to retention='core' enum value behavior
  - `packages/opencode-memory-graph/src/mcp-server.mjs:1-50` — MCP tool registration pattern using wrapMcpHandler; follow this export style

  **API/Type References**:
  - `packages/opencode-integration-layer/src/context-bridge.js:ContextBridge` — Integration pattern; memory bridge will follow similar class structure with constructor injection
  - Supermemory MCP API: `supermemory_memory(content, containerTag)`, `supermemory_recall(query, containerTag, includeProfile)` — These are the target API surface the schema must align with

  **Documentation References**:
  - Mem0 memory record schema: entity-based with importance field; adapt the type enum from Mem0's entity types
  - Stanford Generative Agents: importance scoring (0-10 scale); we adapt to 0-1 float

  **WHY Each Reference Matters**:
  - `audit-logger.js`: Shows how to do content hashing (SHA-256) and immutability enforcement — critical for idempotency keys
  - `learning-engine index.js:134`: Defines the core persistence behavior — must not decay; maps to our retention='core'
  - `context-bridge.js`: Integration layer pattern — memory bridge follows same constructor-injection and threshold-based decision patterns

  **Acceptance Criteria**:

  Agent-Executed QA Scenarios:

  ```
  Scenario: Schema validation rejects invalid records
  Tool: Bash (bun test)
  Preconditions: None
  Steps:
    1. Create test file: packages/opencode-integration-layer/tests/memory-schema.test.js
    2. Test: validateMemoryRecord({}) → {valid: false, errors: contains "project is required"}
    3. Test: validateMemoryRecord({project: "x", type: "invalid"}) → {valid: false, errors: contains "type must be one of"}
    4. Test: validateMemoryRecord({project: "x", type: "fact", importance: 1.5}) → {valid: false, errors: contains "importance must be between 0 and 1"}
    5. Test: validateMemoryRecord({project: "x", type: "fact", importance: 0.7, content: "hello"}) → {valid: true, errors: []}
    6. Run: bun test packages/opencode-integration-layer/tests/memory-schema.test.js
  Expected Result: All 5 tests pass
  Evidence: .sisyphus/evidence/task-1-schema-validation.txt

  Scenario: Idempotency key is deterministic
  Tool: Bash (bun test)
  Preconditions: None
  Steps:
    1. Test: computeIdempotencyKey(normalizeMemoryRecord({project: "x", type: "fact", content: "test"})) produces same result when called twice
    2. Test: Different content produces different key
    3. Test: Same content, different project produces different key
    4. Run: bun test packages/opencode-integration-layer/tests/memory-schema.test.js
  Expected Result: All idempotency tests pass
  Evidence: .sisyphus/evidence/task-1-idempotency-keys.txt

  Scenario: Normalization fills defaults and computes hash
  Tool: Bash (bun test)
  Preconditions: None
  Steps:
    1. Test: normalizeMemoryRecord({project: "x", type: "fact", content: "hello"}) returns record with id (UUID), timestamp (ISO 8601), importance (0.5), content_hash (SHA-256 of "hello"), retention ("perishable")
    2. Test: normalizeMemoryRecord({project: "x", type: "fact", content: "hello", importance: 0.9}) returns record with importance 0.9 (not overridden by default)
    3. Run: bun test packages/opencode-integration-layer/tests/memory-schema.test.js
  Expected Result: All normalization tests pass
  Evidence: .sisyphus/evidence/task-1-normalization.txt
  ```

  **Commit**: YES
  - Message: `feat(memory): add canonical memory schema with validation and idempotency`
  - Files: `packages/opencode-integration-layer/src/memory-schema.js`, `packages/opencode-integration-layer/tests/memory-schema.test.js`
  - Pre-commit: `bun test packages/opencode-integration-layer/tests/memory-schema.test.js`

---

- [ ] 2. Degraded-Mode Fallback Handler

  **What to do**:
  - Create `packages/opencode-integration-layer/src/memory-degraded.js`
  - Implement `DegradedModeHandler` class with:
    - `constructor(options)` — takes `localStoragePath` (platform-aware), `maxQueueSize` (default 1000), `retryIntervalMs` (default 60000)
    - `async write(record)` — if Supermemory available, write directly; if not, serialize to local SQLite queue at `localStoragePath`
    - `async flush()` — attempt to drain queued writes to Supermemory; returns `{flushed, failed, remaining}`
    - `async checkAvailability()` — probe Supermemory via `supermemory_whoAmI()` with 5s timeout
    - `getStatus()` — returns `{available, queuedCount, lastCheckTime}`
    - `disableConsolidation()` — returns true if Supermemory unavailable (prevents destructive operations)
  - Use `os.homedir() + '/.opencode/memory/degraded-queue.db'` for local queue SQLite path
  - SQLite table: `pending_writes (id TEXT PRIMARY KEY, record_json TEXT, queued_at TEXT, attempts INTEGER DEFAULT 0)`
  - Implement exponential backoff on flush retries (1min, 2min, 4min, max 16min)

  **Must NOT do**:
  - Do NOT implement real-time sync — this is batch drain only
  - Do NOT block the main thread on availability checks — use async with timeout
  - Do NOT store full memory content in the queue beyond 1000 items (evict oldest if overflow)

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
  - Reason: Concurrency patterns (queue, backoff, availability) require careful logic
  - **Skills**: [`clean-architecture`]
  - `clean-architecture`: Queue/handler pattern needs clean separation of concerns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 10
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `packages/opencode-model-manager/src/lifecycle/audit-logger.js:295` — ON CONFLICT DO NOTHING pattern for idempotent SQLite writes; use this for queue insertion
  - `packages/opencode-crash-guard/src/crash-recovery.js:153` — Crash frequency monitoring pattern; adapt for availability monitoring
  - `packages/opencode-context-governor/src/index.js:86-90` — Threshold-based alert pattern (75% WARNING, 80% CRITICAL); adapt for queue size alerts

  **API/Type References**:
  - Supermemory MCP: `supermemory_whoAmI()` — Use this as availability probe
  - Supermemory MCP: `supermemory_memory(content, containerTag)` — This is the write target when available

  **WHY Each Reference Matters**:
  - `audit-logger.js:295`: Shows idempotent SQLite insert pattern — prevents duplicate queued writes on retry
  - `crash-recovery.js:153`: Shows how to monitor frequency and trigger warnings — adapt for queue overflow monitoring
  - `context-governor`: Threshold pattern is directly applicable for queue size warnings

  **Acceptance Criteria**:

  Agent-Executed QA Scenarios:

  ```
  Scenario: Queued writes persist when Supermemory unavailable
  Tool: Bash (bun test)
  Preconditions: None
  Steps:
    1. Create test: packages/opencode-integration-layer/tests/memory-degraded.test.js
    2. Mock supermemory_whoAmI to reject (simulate unavailable)
    3. Call degradedHandler.write({project: "x", type: "fact", content: "test"})
    4. Assert: getStatus().available === false
    5. Assert: getStatus().queuedCount === 1
    6. Call degradedHandler.write({project: "x", type: "fact", content: "test2"})
    7. Assert: getStatus().queuedCount === 2
    8. Run: bun test packages/opencode-integration-layer/tests/memory-degraded.test.js
  Expected Result: Tests pass; queue accepts writes when Supermemory down
  Evidence: .sisyphus/evidence/task-2-degraded-queue.txt

  Scenario: Flush drains queue when Supermemory becomes available
  Tool: Bash (bun test)
  Preconditions: Queue has 2 pending writes
  Steps:
    1. Mock supermemory_whoAmI to resolve (simulate available)
    2. Mock supermemory_memory to resolve
    3. Call degradedHandler.flush()
    4. Assert: result.flushed === 2, result.failed === 0, result.remaining === 0
    5. Assert: getStatus().queuedCount === 0
    6. Run: bun test packages/opencode-integration-layer/tests/memory-degraded.test.js
  Expected Result: Queue drains successfully
  Evidence: .sisyphus/evidence/task-2-degraded-flush.txt

  Scenario: Queue overflow evicts oldest entries
  Tool: Bash (bun test)
  Preconditions: maxQueueSize set to 3
  Steps:
    1. Write 4 records (A, B, C, D) while Supermemory unavailable
    2. Assert: queuedCount === 3 (A evicted, B/C/D remain)
    3. Assert: flush() writes B, C, D (not A)
    4. Run: bun test packages/opencode-integration-layer/tests/memory-degraded.test.js
  Expected Result: Oldest evicted on overflow
  Evidence: .sisyphus/evidence/task-2-degraded-overflow.txt

  Scenario: Consolidation disabled when unavailable
  Tool: Bash (bun test)
  Preconditions: Supermemory unavailable
  Steps:
    1. Call degradedHandler.disableConsolidation()
    2. Assert: returns true
    3. Make Supermemory available
    4. Call degradedHandler.disableConsolidation()
    5. Assert: returns false
    6. Run: bun test packages/opencode-integration-layer/tests/memory-degraded.test.js
  Expected Result: Consolidation safety gate works
  Evidence: .sisyphus/evidence/task-2-degraded-consolidation-gate.txt
  ```

  **Commit**: YES
  - Message: `feat(memory): add degraded-mode fallback for Supermemory unavailability`
  - Files: `packages/opencode-integration-layer/src/memory-degraded.js`, `packages/opencode-integration-layer/tests/memory-degraded.test.js`
  - Pre-commit: `bun test packages/opencode-integration-layer/tests/memory-degraded.test.js`

---

- [ ] 3. Platform-Aware Path Resolution

  **What to do**:
  - Create `packages/opencode-integration-layer/src/memory-paths.js`
  - Implement `resolveMemoryBaseDir()` using `os.homedir() + '/.opencode/memory/'`
  - Implement `resolveMemorySubdir(name)` — returns `path.join(resolveMemoryBaseDir(), name)`
  - Handle Windows: replace forward slashes, handle potential `C:\Users\...` paths
  - Implement `ensureMemoryDir(name)` — `mkdirSync` with `{recursive: true}` if not exists
  - Define all memory-related paths as constants:
    - `MEMORY_BASE_DIR` = `~/.opencode/memory/`
    - `DEGRADED_QUEUE_DB` = `~/.opencode/memory/degraded-queue.db`
    - `CONSOLIDATION_AUDIT_DB` = `~/.opencode/memory/consolidation-audit.db`
    - `SCORING_CACHE_DB` = `~/.opencode/memory/scoring-cache.db`
  - Validate that `os.homedir()` returns a valid path; throw descriptive error if not
  - Export all path constants + resolver functions

  **Must NOT do**:
  - Do NOT hardcode `/home/` or `/Users/` — must work on Windows, Linux, macOS
  - Do NOT create directories on module import — only on explicit `ensureMemoryDir()` call
  - Do NOT use `process.env.HOME` directly — use `os.homedir()` which is cross-platform

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - Reason: Small, focused utility module with clear requirements
  - **Skills**: [`clean-architecture`]
  - `clean-architecture`: Path handling is infrastructure — must be clean and testable

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 4, 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `packages/opencode-memory-graph/src/mcp-server.mjs:12` — Current path resolution: `os.homedir() + '/.opencode/memory-graph.json'`; adapt this pattern but centralize it
  - `packages/opencode-learning-engine/src/index.js` — Uses `~/.opencode/learning/` for data; this path will be consolidated under the new base dir

  **Documentation References**:
  - Node.js `os.homedir()` docs: Returns the home directory path; cross-platform (Windows: `C:\Users\username`, Unix: `/home/username`)

  **WHY Each Reference Matters**:
  - `mcp-server.mjs:12`: Shows current ad-hoc path resolution — this task centralizes that pattern into a shared module
  - `learning-engine`: Shows another ad-hoc path — will be migrated to use the central resolver

  **Acceptance Criteria**:

  Agent-Executed QA Scenarios:

  ```
  Scenario: Path resolution works cross-platform
  Tool: Bash (bun test)
  Preconditions: None
  Steps:
    1. Create test: packages/opencode-integration-layer/tests/memory-paths.test.js
    2. Test: resolveMemoryBaseDir() returns path ending with '.opencode/memory' (platform-adapted separator)
    3. Test: resolveMemorySubdir('scoring') returns path containing 'scoring'
    4. Test: DEGRADED_QUEUE_DB contains 'degraded-queue.db'
    5. Test: os.homedir() is called (mock and verify)
    6. Run: bun test packages/opencode-integration-layer/tests/memory-paths.test.js
  Expected Result: All 5 tests pass
  Evidence: .sisyphus/evidence/task-3-path-resolution.txt

  Scenario: Directory creation works
  Tool: Bash (bun test)
  Preconditions: None
  Steps:
    1. Test: ensureMemoryDir('test-subdir') creates directory
    2. Verify: fs.existsSync(resolveMemorySubdir('test-subdir')) === true
    3. Cleanup: fs.rmdirSync(resolveMemorySubdir('test-subdir'))
    4. Run: bun test packages/opencode-integration-layer/tests/memory-paths.test.js
  Expected Result: Directory created and verified
  Evidence: .sisyphus/evidence/task-3-dir-creation.txt
  ```

  **Commit**: YES
  - Message: `feat(memory): add platform-aware path resolution for memory subsystems`
  - Files: `packages/opencode-integration-layer/src/memory-paths.js`, `packages/opencode-integration-layer/tests/memory-paths.test.js`
  - Pre-commit: `bun test packages/opencode-integration-layer/tests/memory-paths.test.js`

---

- [ ] 4. Unified Memory Write Bridge

  **What to do**:
  - Create `packages/opencode-integration-layer/src/memory-bridge.js`
  - Implement `MemoryBridge` class:
    - `constructor({schema, degradedHandler, pathResolver, logger})` — inject dependencies
    - `async save(record)` — Main write path:
      1. Validate via `validateMemoryRecord(record)` → reject if invalid
      2. Normalize via `normalizeMemoryRecord(record)` → fill defaults, compute hash
      3. Compute idempotency key → check if already exists (via recall)
      4. If duplicate → return existing memory ID (idempotent)
      5. If new → write to Supermemory via `supermemory_memory(content, containerTag)`
      6. On Supermemory failure → delegate to `degradedHandler.write(record)`
      7. Return `{id, status: 'saved'|'duplicate'|'queued'}`
    - `async recall(query, options)` — Main read path:
      1. Call `supermemory_recall(query, containerTag=options.project, includeProfile=false)`
      2. If Supermemory unavailable → return `{memories: [], status: 'degraded', message: 'Memory unavailable'}`
      3. Return `{memories, status: 'ok'}`
    - `async search(query, options)` — Vector search path:
      1. Call `supermemory_recall(query)` for vector similarity search
      2. Return results with computed scores from scoring pipeline
  - Wire `memory-bridge` into the integration layer's bootstrap process
  - Update `packages/opencode-integration-layer/src/index.js` to export `MemoryBridge`

  **Must NOT do**:
  - Do NOT write to memory-graph or learning-engine directly — they are derived layers updated during consolidation
  - Do NOT implement caching on the write path — idempotency via content_hash is sufficient
  - Do NOT block on Supermemory writes — use async with timeout (5s write, 10s recall)

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
  - Reason: Core data flow orchestration with multiple failure modes
  - **Skills**: [`clean-architecture`]
  - `clean-architecture`: Bridge is a clean architecture gateway — must separate concerns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: Tasks 8, 10
  - **Blocked By**: Tasks 1, 3

  **References**:

  **Pattern References**:
  - `packages/opencode-integration-layer/src/context-bridge.js:1-50` — Constructor injection pattern with governor, logger, securityVeto; follow this pattern exactly for MemoryBridge
  - `packages/opencode-integration-layer/src/bootstrap.js` — Bootstrap wiring pattern; MemoryBridge will be wired here

  **API/Type References**:
  - `packages/opencode-integration-layer/src/memory-schema.js:validateMemoryRecord` — Used in save() flow
  - `packages/opencode-integration-layer/src/memory-schema.js:normalizeMemoryRecord` — Used in save() flow
  - `packages/opencode-integration-layer/src/memory-schema.js:computeIdempotencyKey` — Used for duplicate detection
  - `packages/opencode-integration-layer/src/memory-degraded.js:DegradedModeHandler` — Used as fallback

  **Test References**:
  - `packages/opencode-integration-layer/tests/memory-degraded.test.js` — Mock pattern for Supermemory unavailability; reuse

  **WHY Each Reference Matters**:
  - `context-bridge.js`: Exact architectural pattern to follow — constructor injection, threshold-based decisions, async methods
  - `bootstrap.js`: Where MemoryBridge gets instantiated and wired into the system
  - `memory-schema.js`: The validation/normalization pipeline that save() must call

  **Acceptance Criteria**:

  Agent-Executed QA Scenarios:

  ```
  Scenario: Save writes to Supermemory and returns saved status
  Tool: Bash (bun test)
  Preconditions: Tasks 1, 3 complete; Supermemory mocked
  Steps:
    1. Create test: packages/opencode-integration-layer/tests/memory-bridge.test.js
    2. Mock supermemory_memory to resolve with {id: "mem_123"}
    3. Call bridge.save({project: "sm_project_default", type: "fact", content: "User prefers dark mode"})
    4. Assert: result.status === 'saved'
    5. Assert: result.id is defined
    6. Run: bun test packages/opencode-integration-layer/tests/memory-bridge.test.js
  Expected Result: Save succeeds with 'saved' status
  Evidence: .sisyphus/evidence/task-4-bridge-save.txt

  Scenario: Save detects duplicate via idempotency key
  Tool: Bash (bun test)
  Preconditions: Memory already exists
  Steps:
    1. Mock supermemory_recall to return existing memory with same content_hash
    2. Call bridge.save({project: "x", type: "fact", content: "duplicate content"})
    3. Assert: result.status === 'duplicate'
    4. Assert: supermemory_memory was NOT called
    5. Run: bun test packages/opencode-integration-layer/tests/memory-bridge.test.js
  Expected Result: Duplicate detected, no double-write
  Evidence: .sisyphus/evidence/task-4-bridge-duplicate.txt

  Scenario: Save falls back to degraded queue when Supermemory unavailable
  Tool: Bash (bun test)
  Preconditions: Supermemory mocked to reject
  Steps:
    1. Mock supermemory_memory to reject with timeout
    2. Call bridge.save({project: "x", type: "fact", content: "queued content"})
    3. Assert: result.status === 'queued'
    4. Assert: degradedHandler.queuedCount === 1
    5. Run: bun test packages/opencode-integration-layer/tests/memory-bridge.test.js
  Expected Result: Write queued for later flush
  Evidence: .sisyphus/evidence/task-4-bridge-degraded.txt

  Scenario: Recall returns memories with ok status
  Tool: Bash (bun test)
  Preconditions: Supermemory mocked to return 2 memories
  Steps:
    1. Mock supermemory_recall to return {memories: [{content: "pref1"}, {content: "pref2"}]}
    2. Call bridge.recall("user preferences", {project: "x"})
    3. Assert: result.status === 'ok'
    4. Assert: result.memories.length === 2
    5. Run: bun test packages/opencode-integration-layer/tests/memory-bridge.test.js
  Expected Result: Recall returns memories successfully
  Evidence: .sisyphus/evidence/task-4-bridge-recall.txt

  Scenario: Recall returns degraded status when unavailable
  Tool: Bash (bun test)
  Preconditions: Supermemory mocked to reject
  Steps:
    1. Mock supermemory_recall to reject
    2. Call bridge.recall("query", {project: "x"})
    3. Assert: result.status === 'degraded'
    4. Assert: result.memories.length === 0
    5. Run: bun test packages/opencode-integration-layer/tests/memory-bridge.test.js
  Expected Result: Graceful degradation with empty results
  Evidence: .sisyphus/evidence/task-4-bridge-recall-degraded.txt
  ```

  **Commit**: YES
  - Message: `feat(memory): add unified memory write/recall bridge with degraded fallback`
  - Files: `packages/opencode-integration-layer/src/memory-bridge.js`, `packages/opencode-integration-layer/tests/memory-bridge.test.js`
  - Pre-commit: `bun test packages/opencode-integration-layer/tests/memory-bridge.test.js`

---

- [ ] 5. Deterministic Scoring Pipeline

  **What to do**:
  - Create `packages/opencode-learning-engine/src/memory-scoring.js`
  - Implement `MemoryScoringPipeline` class:
    - `constructor({weights, cacheDbPath})` — default weights: `{recency: 0.4, importance: 0.35, relevance: 0.25}`
    - `score(memory, context)` — returns `{total, breakdown: {recency, importance, relevance}}`
  - Implement `computeRecency(timestamp, now, retention)`:
    - Exponential decay: `Math.exp(-0.005 * hoursSinceCreation)` where hoursSinceCreation = (now - timestamp) / 3600000
    - Exception: if `retention === 'core'`, recency is ALWAYS 1.0 (never decays, per learning-engine rule at index.js:134)
  - Implement `computeImportance(record)`:
    - Use `record.importance` field if set (0-1 scale)
    - Default importance by type: `decision=0.9, error=0.8, preference=0.7, fact=0.5, pattern=0.6, session_context=0.3`
  - Implement `computeRelevance(memory, query)`:
    - Cosine similarity between query embedding and memory content
    - If no embedding available, fall back to keyword overlap (Jaccard similarity on tokenized words)
    - Return 0.0 if query is empty
  - Implement composite: `total = recency * weights.recency + importance * weights.importance + relevance * weights.relevance`
  - Log feature breakdown for every scoring call: `{memoryId, query, recency_raw, importance_raw, relevance_raw, weights_applied, total}`
  - Cache scores in SQLite at `cacheDbPath` with 5-minute TTL, key = `SHA-256(memoryId + query + weights JSON)`
  - Create `packages/opencode-learning-engine/tests/memory-scoring.test.js` with EXACT expected values:
    - Test fixture: memory created 0 hours ago, importance 0.7, relevance 1.0, weights {0.4, 0.35, 0.25} → expected total = 0.7 × 0.35 + 1.0 × 0.25 + 1.0 × 0.4 = 0.895
    - Test fixture: core retention memory, 1000 hours old → recency = 1.0 (not decayed)
    - Test fixture: 24-hour-old memory → recency = exp(-0.005 × 24) = 0.8869
  - Export: `MemoryScoringPipeline`, `computeRecency`, `computeImportance`, `computeRelevance`, `DEFAULT_WEIGHTS`

  **Must NOT do**:
  - Do NOT use LLM calls for importance — use deterministic rules from schema fields
  - Do NOT make scoring async (except for optional embedding lookup) — must be CPU-bound for determinism
  - Do NOT change the core persistence rule — weight is ALWAYS 1.0 when retention is 'core' (per index.js:134)

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
  - Reason: Mathematical scoring with exact test fixtures requires precision
  - **Skills**: [`clean-architecture`]
  - `clean-architecture`: Scoring is pure business logic — no side effects, fully deterministic

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6)
  - **Blocks**: Tasks 7, 8, 9
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `packages/opencode-learning-engine/src/index.js:134` — Core persistence rule: `if persistence === 'core', weight = 1.0`; MUST preserve this in recency calculation
  - `packages/opencode-learning-engine/src/index.js:AntiPatternCatalog` and `PositivePatternTracker` — existing pattern extraction logic that can inform default importance by type
  - `packages/opencode-model-manager/src/monitoring/metrics-collector.js` — Metrics collection pattern; adapt for scoring breakdown logging

  **API/Type References**:
  - `packages/opencode-integration-layer/src/memory-schema.js:MEMORY_TYPES` — Type enum used for default importance mapping
  - `packages/opencode-integration-layer/src/memory-schema.js:RETENTION_POLICIES` — Retention enum used for core persistence rule

  **Documentation References**:
  - Mem0 scoring: `recency * recency_weight + importance * importance_weight + relevance * relevance_weight`; direct inspiration for our composite formula
  - Stanford Generative Agents: Exponential decay for recency with `decay_factor = 0.995`; we adapt to `exp(-0.005 * hours)`

  **WHY Each Reference Matters**:
  - `learning-engine index.js:134`: CRITICAL — the core persistence rule must be preserved exactly or existing behavior breaks
  - `MEMORY_TYPES`: The scoring pipeline maps these types to default importance values
  - `metrics-collector.js`: Shows how to log structured metrics — scoring breakdown follows same pattern

  **Acceptance Criteria**:

  Agent-Executed QA Scenarios:

  ```
  Scenario: Scoring produces exact expected values for fresh memory
  Tool: Bash (bun test)
  Preconditions: None
  Steps:
    1. Run: bun test packages/opencode-learning-engine/tests/memory-scoring.test.js
    2. Test: memory created 0 hours ago, importance 0.7, relevance 1.0, weights {0.4, 0.35, 0.25}
    3. Assert: total === 0.895 (exact, not tolerance)
    4. Assert: breakdown.recency === 1.0
    5. Assert: breakdown.importance === 0.7
    6. Assert: breakdown.relevance === 1.0
  Expected Result: Exact scoring values match
  Evidence: .sisyphus/evidence/task-5-scoring-fresh.txt

  Scenario: Core retention memory never decays
  Tool: Bash (bun test)
  Preconditions: None
  Steps:
    1. Test: memory with retention='core', created 1000 hours ago
    2. Assert: breakdown.recency === 1.0 (NOT decayed)
    3. Assert: total > 0.5 (core memories always rank high)
  Expected Result: Core memories immune to temporal decay
  Evidence: .sisyphus/evidence/task-5-scoring-core.txt

  Scenario: Recency decays exponentially
  Tool: Bash (bun test)
  Preconditions: None
  Steps:
    1. Test: memory created 24 hours ago, retention='perishable'
    2. Assert: breakdown.recency is approximately 0.8869 (within 0.001)
    3. Test: memory created 168 hours (1 week) ago
    4. Assert: breakdown.recency is approximately 0.4305
    5. Test: memory created 720 hours (1 month) ago
    6. Assert: breakdown.recency < 0.05
  Expected Result: Exponential decay curve verified at multiple points
  Evidence: .sisyphus/evidence/task-5-scoring-decay.txt

  Scenario: Scoring is deterministic (same inputs = same output)
  Tool: Bash (bun test)
  Preconditions: None
  Steps:
    1. Call score(memory, context) 100 times with same inputs
    2. Assert: all 100 results are identical (bit-for-bit)
    3. Run: bun test packages/opencode-learning-engine/tests/memory-scoring.test.js
  Expected Result: Zero variance across repeated calls
  Evidence: .sisyphus/evidence/task-5-scoring-deterministic.txt

  Scenario: Scoring breakdown is logged
  Tool: Bash (bun test)
  Preconditions: None
  Steps:
    1. Call score() with a mock logger
    2. Assert: logger.info called with object containing {memoryId, query, recency_raw, importance_raw, relevance_raw, weights_applied, total}
    3. Run: bun test packages/opencode-learning-engine/tests/memory-scoring.test.js
  Expected Result: Breakdown logged for every scoring call
  Evidence: .sisyphus/evidence/task-5-scoring-logging.txt
  ```

  **Commit**: YES
  - Message: `feat(memory): add deterministic scoring pipeline with exact test fixtures`
  - Files: `packages/opencode-learning-engine/src/memory-scoring.js`, `packages/opencode-learning-engine/tests/memory-scoring.test.js`
  - Pre-commit: `bun test packages/opencode-learning-engine/tests/memory-scoring.test.js`

---

- [ ] 6. Meta-Memory Pointer Layer

  **What to do**:
  - Create `packages/opencode-memory-graph/src/meta-memory-bridge.js`
  - Implement `MetaMemoryBridge` class:
    - `constructor({memoryGraph, logger})` — inject existing MemoryGraph instance
    - `async addMetaPointer(supermemoryId, entityType, relationships)` — Add a node to the memory graph that points to a Supermemory record
      - Node fields: `{supermemoryId, entityType, sourcePackage: 'supermemory', created_at, updated_at}`
      - NO raw content stored — only the pointer + type + relationships
    - `async getMetaPointer(supermemoryId)` — Retrieve graph node by Supermemory ID
    - `async getRelatedMemories(supermemoryId, depth=1)` — Traverse graph edges from a memory pointer to find related memories
    - `async addRelationship(fromId, toId, relationType, weight)` — Add edge between memory pointers (relationType: 'caused_by', 'related_to', 'evolved_from', 'contradicts', 'supports')
    - `async enrichRecall(memories, query)` — Given a list of recalled memories, add graph-derived context (related memories, patterns, community structure)
  - Add invariant check: `assertNoRawContent(node)` — throws if any graph node contains `content` field with full text (enforces derived-only policy)
  - Wire into `packages/opencode-memory-graph/src/mcp-server.mjs` as additional MCP tool handler: `metaMemoryAddPointer`, `metaMemoryGetRelated`

  **Must NOT do**:
  - Do NOT store full memory content in the graph — only Supermemory IDs + type + relationships
  - Do NOT modify existing memory-graph tools (buildMemoryGraph, etc.) — additive only
  - Do NOT make this a replacement for Supermemory recall — it is enrichment only

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
  - Reason: Graph pointer integrity with invariant enforcement requires careful design
  - **Skills**: [`clean-architecture`]
  - `clean-architecture`: Enforcing the derived-only invariant is a critical architectural boundary

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: Task 10
  - **Blocked By**: Tasks 1, 3

  **References**:

  **Pattern References**:
  - `packages/opencode-memory-graph/src/index.js:MemoryGraph` — Existing graph class; MetaMemoryBridge wraps this
  - `packages/opencode-memory-graph/src/mcp-server.mjs` — MCP tool registration using `wrapMcpHandler`; add new tools following this pattern
  - `packages/opencode-memory-graph/src/graph-v3.js` — Graph data structure (nodes, edges); understand the internal model before adding pointer nodes
  - `packages/opencode-memory-graph/src/node-store.js` — Node storage; understand schema before adding supermemoryId field

  **API/Type References**:
  - `packages/opencode-integration-layer/src/memory-schema.js` — Memory record schema; `supermemoryId` in graph must reference these records' `id` field

  **WHY Each Reference Matters**:
  - `index.js:MemoryGraph`: The core graph class that MetaMemoryBridge wraps — must understand its API to extend correctly
  - `mcp-server.mjs`: Pattern for adding new MCP tools — must follow same registration approach
  - `graph-v3.js`: Internal graph model — pointer nodes must conform to this structure
  - `node-store.js`: Storage format — supermemoryId must be stored as a node attribute

  **Acceptance Criteria**:

  Agent-Executed QA Scenarios:

  ```
  Scenario: Meta pointer stores only ID, no raw content
  Tool: Bash (bun test)
  Preconditions: None
  Steps:
    1. Create test: packages/opencode-memory-graph/tests/meta-memory-bridge.test.js
    2. Call addMetaPointer("mem_123", "fact", {relationships: [{targetId: "mem_456", type: "related_to"}]})
    3. Retrieve node from graph
    4. Assert: node.supermemoryId === "mem_123"
    5. Assert: node.content is undefined (no raw content)
    6. Assert: node.sourcePackage === "supermemory"
    7. Run: bun test packages/opencode-memory-graph/tests/meta-memory-bridge.test.js
  Expected Result: Pointer node stores ID only, no content
  Evidence: .sisyphus/evidence/task-6-meta-pointer.txt

  Scenario: Invariant check rejects raw content in graph
  Tool: Bash (bun test)
  Preconditions: None
  Steps:
    1. Attempt to add node with {supermemoryId: "mem_123", content: "full text should not be here"}
    2. Assert: assertNoRawContent throws Error containing "raw content not allowed in meta-memory"
    3. Run: bun test packages/opencode-memory-graph/tests/meta-memory-bridge.test.js
  Expected Result: Invariant enforced, raw content rejected
  Evidence: .sisyphus/evidence/task-6-meta-invariant.txt

  Scenario: Related memories retrieved via graph traversal
  Tool: Bash (bun test)
  Preconditions: Two pointers with relationship edge
  Steps:
    1. Add pointer for "mem_123" and "mem_456"
    2. Add relationship: mem_123 → related_to → mem_456
    3. Call getRelatedMemories("mem_123", depth=1)
    4. Assert: result contains "mem_456"
    5. Assert: result does NOT contain content of mem_456 (only ID)
    6. Run: bun test packages/opencode-memory-graph/tests/meta-memory-bridge.test.js
  Expected Result: Graph traversal returns related IDs
  Evidence: .sisyphus/evidence/task-6-meta-traversal.txt

  Scenario: Enrich recall adds graph context
  Tool: Bash (bun test)
  Preconditions: Memories with graph relationships exist
  Steps:
    1. Call enrichRecall([{id: "mem_123"}], "query")
    2. Assert: result[0].relatedMemories contains [{id: "mem_456", relationType: "related_to"}]
    3. Assert: result[0].communityInfo is present (if graph has community structure)
    4. Run: bun test packages/opencode-memory-graph/tests/meta-memory-bridge.test.js
  Expected Result: Recall enriched with graph-derived context
  Evidence: .sisyphus/evidence/task-6-meta-enrich.txt
  ```

  **Commit**: YES
  - Message: `feat(memory): add meta-memory pointer layer enforcing derived-only invariant`
  - Files: `packages/opencode-memory-graph/src/meta-memory-bridge.js`, `packages/opencode-memory-graph/tests/meta-memory-bridge.test.js`
  - Pre-commit: `bun test packages/opencode-memory-graph/tests/meta-memory-bridge.test.js`

---

- [ ] 7. Temporal Intelligence Layer

  **What to do**:
  - Create `packages/opencode-learning-engine/src/temporal-intelligence.js`
  - Implement `TemporalIntelligence` class:
    - `constructor({scoringPipeline, logger})` — inject scoring pipeline
    - `async rankByTimeContext(memories, context)` — Re-rank memories based on temporal relevance:
      - **Recency boost**: Memories created in the current session get 1.5x recency multiplier
      - **Temporal clustering**: Memories near each other in time get slight boost (plus or minus 1 hour window)
      - **Time-of-day patterns**: If user typically works in morning, morning memories get slight boost (0.05)
      - **Recency decay curve**: Already handled by scoring pipeline — this layer adds contextual modifiers
    - `async detectTemporalPatterns(project)` — Analyze memory timestamps to detect:
      - Active hours (when user creates most memories)
      - Session boundaries (gaps > 30 min indicate new session)
      - Burst patterns (many memories in short time = active problem-solving)
    - `getTemporalContext(now)` — Returns `{timeOfDay, dayOfWeek, isWeekend, sessionAge, recentActivityLevel}`
  - All temporal modifications must be LOGGED: `{memoryId, originalScore, modifiedScore, modifiersApplied}`
  - This layer is OPTIONAL — it enhances recall quality but is not required for correctness

  **Must NOT do**:
  - Do NOT make this layer mandatory — recall works without it, this is enrichment
  - Do NOT override core retention scores — retention='core' memories always rank high regardless of temporal modifiers
  - Do NOT implement predictive features — only retrospective temporal analysis

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - Reason: Temporal analysis is well-defined but requires careful math
  - **Skills**: [`clean-architecture`]
  - `clean-architecture`: Temporal modifiers must be pure functions with logged effects

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 9)
  - **Blocks**: Task 10
  - **Blocked By**: Task 5

  **References**:

  **Pattern References**:
  - `packages/opencode-learning-engine/src/memory-scoring.js:computeRecency` — Recency decay function; temporal layer modifies the OUTPUT of this, not the function itself
  - `packages/opencode-learning-engine/src/index.js:AntiPatternCatalog` — Pattern detection approach; adapt for temporal pattern detection
  - `packages/opencode-learning-engine/src/index.js:MetaAwarenessTracker` — Self-awareness tracking; temporal context feeds into this

  **API/Type References**:
  - `packages/opencode-learning-engine/src/memory-scoring.js:MemoryScoringPipeline` — Injected dependency; temporal layer wraps scoring pipeline output

  **WHY Each Reference Matters**:
  - `memory-scoring.js`: Temporal layer builds on top of scoring — it must understand the scoring output format
  - `AntiPatternCatalog`: Pattern detection infrastructure — temporal pattern detection follows same approach
  - `MetaAwarenessTracker`: Temporal context can feed into meta-awareness for smarter orchestration

  **Acceptance Criteria**:

  Agent-Executed QA Scenarios:

  ```
  Scenario: Current session memories get recency boost
  Tool: Bash (bun test)
  Preconditions: Scoring pipeline returns base scores
  Steps:
    1. Create test: packages/opencode-learning-engine/tests/temporal-intelligence.test.js
    2. Mock: memory created 5 min ago (current session), base recency = 0.9
    3. Call rankByTimeContext([memory], {now: Date.now()})
    4. Assert: modified recency === 0.9 * 1.5 = 1.0 (clamped to max 1.0)
    5. Assert: modifiersApplied includes "current_session_boost"
    6. Run: bun test packages/opencode-learning-engine/tests/temporal-intelligence.test.js
  Expected Result: Session boost applied and clamped
  Evidence: .sisyphus/evidence/task-7-temporal-boost.txt

  Scenario: Core retention memories not overridden by temporal modifiers
  Tool: Bash (bun test)
  Preconditions: Core retention memory
  Steps:
    1. Mock: core memory with high base score (0.95)
    2. Call rankByTimeContext([memory], {now: Date.now()})
    3. Assert: final score >= 0.95 (never decreased by temporal layer)
    4. Run: bun test packages/opencode-learning-engine/tests/temporal-intelligence.test.js
  Expected Result: Core memories protected from temporal decay
  Evidence: .sisyphus/evidence/task-7-temporal-core-protection.txt

  Scenario: Temporal patterns detected from memory timestamps
  Tool: Bash (bun test)
  Preconditions: Multiple memories with varied timestamps
  Steps:
    1. Create fixtures: 10 memories, 8 created between 9am-12pm, 2 at other times
    2. Call detectTemporalPatterns("project-x")
    3. Assert: activeHours includes range overlapping 9-12
    4. Assert: sessionBoundaries detected (gaps > 30 min)
    5. Run: bun test packages/opencode-learning-engine/tests/temporal-intelligence.test.js
  Expected Result: Active hours and session boundaries detected
  Evidence: .sisyphus/evidence/task-7-temporal-patterns.txt

  Scenario: Temporal modifications are logged
  Tool: Bash (bun test)
  Preconditions: Mock logger
  Steps:
    1. Call rankByTimeContext with memories
    2. Assert: logger.info called with {memoryId, originalScore, modifiedScore, modifiersApplied}
    3. Run: bun test packages/opencode-learning-engine/tests/temporal-intelligence.test.js
  Expected Result: All modifications logged for auditability
  Evidence: .sisyphus/evidence/task-7-temporal-logging.txt
  ```

  **Commit**: YES
  - Message: `feat(memory): add temporal intelligence layer for context-aware ranking`
  - Files: `packages/opencode-learning-engine/src/temporal-intelligence.js`, `packages/opencode-learning-engine/tests/temporal-intelligence.test.js`
  - Pre-commit: `bun test packages/opencode-learning-engine/tests/temporal-intelligence.test.js`

---

- [ ] 8. Consolidation Script with Idempotency and Audit Trail

  **What to do**:
  - Create `scripts/memory-consolidate.mjs`
  - CLI interface with these flags:
    - `--project <tag>` — Container tag to consolidate (required)
    - `--dry-run` — Preview changes without applying (default)
    - `--apply` — Actually apply changes (requires confirmation via `--confirm`)
    - `--confirm` — Skip confirmation prompt (for automation)
    - `--format <json|text>` — Output format (default: text)
    - `--min-age <hours>` — Only consolidate memories older than N hours (default: 168 = 1 week)
    - `--verbose` — Show detailed breakdown
  - Consolidation phases:
    1. **Fetch**: Retrieve all memories for project via `supermemory_recall("*", {project})`
    2. **Deduplicate**: Group by idempotency key (content_hash + project + type); merge duplicates keeping highest importance
    3. **Decay**: Reduce importance of ephemeral memories by `decay_factor = 0.95` per week since creation; mark for deletion if importance < 0.1
    4. **Merge**: Combine memories with same entity references
    5. **Extract entities**: Parse memories for entity references and update meta-memory pointers
    6. **Report**: Output JSON with `{dedupedCount, mergedCount, decayedCount, deletedCount, unchangedCount, auditLogPath}`
  - Idempotency: Running `--dry-run` twice produces byte-for-byte identical JSON output
  - Audit trail: When `--apply` is used, write decisions to SQLite at `~/.opencode/memory/consolidation-audit.db`
    - Table: `consolidation_runs (run_id TEXT, started_at TEXT, project TEXT, decisions_json TEXT, applied INTEGER)`
    - Table: `consolidation_decisions (id TEXT, run_id TEXT, memory_id TEXT, action TEXT, reason TEXT, before_json TEXT, after_json TEXT)`
  - After `--apply`, subsequent `--dry-run` should show 0 changes (steady state)

  **Must NOT do**:
  - Do NOT delete retention='core' memories — they are never decayed or deleted
  - Do NOT run consolidation if `degradedHandler.disableConsolidation()` returns true
  - Do NOT modify Supermemory records directly — use the memory bridge's save API
  - Do NOT consolidate without audit trail — every mutation must be traceable

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - Reason: CLI script with complex phases and safety constraints
  - **Skills**: [`clean-architecture`]
  - `clean-architecture`: Consolidation is a batch operation — must be idempotent, auditable, and reversible

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 7, 9)
  - **Blocks**: Task 10
  - **Blocked By**: Tasks 4, 5

  **References**:

  **Pattern References**:
  - `scripts/model-rollback.mjs` — Existing rollback script with `--to-last-good`, `--to-timestamp`, `--dry-run` flags; follow this CLI pattern exactly
  - `packages/opencode-model-manager/src/lifecycle/audit-logger.js` — Immutable audit log with hash chain; follow this pattern for consolidation audit trail
  - `scripts/health-check.mjs` — Large infrastructure script (11KB); follow this structure for the consolidation script

  **API/Type References**:
  - `packages/opencode-integration-layer/src/memory-bridge.js:MemoryBridge` — Used for fetching and saving memories during consolidation
  - `packages/opencode-integration-layer/src/memory-schema.js:computeIdempotencyKey` — Used for deduplication grouping
  - `packages/opencode-learning-engine/src/memory-scoring.js:computeRecency` — Used for decay calculations
  - `packages/opencode-integration-layer/src/memory-degraded.js:DegradedModeHandler` — Check `disableConsolidation()` before running

  **WHY Each Reference Matters**:
  - `model-rollback.mjs`: Exact CLI flag pattern (dry-run, confirm, format) — must match this UX
  - `audit-logger.js`: Hash chain audit log — consolidation must produce similarly tamper-evident trail
  - `health-check.mjs`: Script structure reference for complex infrastructure scripts
  - `memory-bridge.js`: The only approved way to write memories — consolidation must not bypass it

  **Acceptance Criteria**:

  Agent-Executed QA Scenarios:

  ```
  Scenario: Dry-run produces idempotent JSON output
  Tool: Bash
  Preconditions: Tasks 4, 5 complete; test memories exist in Supermemory (mocked)
  Steps:
    1. Run: node scripts/memory-consolidate.mjs --project sm_project_default --dry-run --format json > /tmp/run1.json
    2. Run: node scripts/memory-consolidate.mjs --project sm_project_default --dry-run --format json > /tmp/run2.json
    3. Run: diff /tmp/run1.json /tmp/run2.json
    4. Assert: exit code 0 (files identical)
    5. Assert: JSON contains {dedupedCount, mergedCount, decayedCount, unchangedCount}
  Expected Result: Byte-for-byte identical output on repeated dry-runs
  Evidence: .sisyphus/evidence/task-8-consolidate-idempotent.txt

  Scenario: Apply produces audit trail and achieves steady state
  Tool: Bash
  Preconditions: Memories exist for consolidation
  Steps:
    1. Run: node scripts/memory-consolidate.mjs --project sm_project_default --apply --confirm --format json
    2. Assert: exit code 0
    3. Assert: output JSON includes auditLogPath
    4. Assert: output JSON includes applied=true
    5. Run: node scripts/memory-consolidate.mjs --project sm_project_default --dry-run --format json
    6. Assert: JSON shows {dedupedCount: 0, mergedCount: 0, decayedCount: 0, unchangedCount: N}
  Expected Result: Audit trail created; steady state achieved after apply
  Evidence: .sisyphus/evidence/task-8-consolidate-apply.txt

  Scenario: Core memories are never decayed or deleted
  Tool: Bash
  Preconditions: Mix of core and perishable memories
  Steps:
    1. Run: node scripts/memory-consolidate.mjs --project sm_project_default --dry-run --format json --verbose
    2. Parse JSON output
    3. Assert: no core retention memory appears in decayed or deleted lists
    4. Assert: all core memories are in unchangedCount
  Expected Result: Core memories protected from consolidation
  Evidence: .sisyphus/evidence/task-8-consolidate-core-protection.txt

  Scenario: Consolidation blocked when Supermemory unavailable
  Tool: Bash
  Preconditions: Supermemory mocked as unavailable
  Steps:
    1. Mock degradedHandler.disableConsolidation() to return true
    2. Run: node scripts/memory-consolidate.mjs --project sm_project_default --apply --confirm
    3. Assert: exit code 1
    4. Assert: stderr contains "Consolidation disabled: Supermemory unavailable"
  Expected Result: Consolidation safely blocked during degraded mode
  Evidence: .sisyphus/evidence/task-8-consolidate-blocked.txt
  ```

  **Commit**: YES
  - Message: `feat(memory): add consolidation script with idempotent dry-run and audit trail`
  - Files: `scripts/memory-consolidate.mjs`
  - Pre-commit: `node scripts/memory-consolidate.mjs --dry-run --project sm_project_default --format json`

---

- [ ] 9. Learning-Engine Adaptive Weights

  **What to do**:
  - Create `packages/opencode-learning-engine/src/adaptive-weights.js`
  - Implement `AdaptiveWeightOptimizer` class:
    - `constructor({learningDbPath, logger})` — inject SQLite path
    - `async updateWeights(project, feedback)` — Adjust scoring weights based on retrieval feedback:
      - `feedback` = `{query, recalledMemories, userSelectedMemory}` (which memory the user actually found useful)
      - If user-selected memory had high relevance but low recency → increase `weights.relevance`, decrease `weights.recency`
      - If user-selected memory was recent but low relevance → increase `weights.recency`, decrease `weights.relevance`
      - Weight adjustments: plus or minus 0.02 per feedback event, bounded in [0.1, 0.6] per weight
      - After adjustment, normalize weights to sum to 1.0
    - `async getWeights(project)` — Return current weights for project (default: `{recency: 0.4, importance: 0.35, relevance: 0.25}`)
    - `async resetWeights(project)` — Reset to defaults
    - `async getWeightHistory(project)` — Return adjustment history for debugging
  - Store weights in SQLite at `~/.opencode/memory/adaptive-weights.db`
    - Table: `project_weights (project TEXT PRIMARY KEY, weights_json TEXT, updated_at TEXT)`
    - Table: `weight_adjustments (id INTEGER PRIMARY KEY, project TEXT, before_json TEXT, after_json TEXT, feedback_json TEXT, adjusted_at TEXT)`
  - Wire into scoring pipeline: `MemoryScoringPipeline` constructor accepts optional `adaptiveWeights` — if provided, uses project-specific weights instead of defaults

  **Must NOT do**:
  - Do NOT modify weights for retention='core' memories — core retention is immutable regardless of weight adjustments
  - Do NOT allow weights to go below 0.1 or above 0.6 — prevents any single factor from dominating
  - Do NOT make weight adjustments synchronous with recall — feedback is processed asynchronously
  - Do NOT implement complex ML training — this is simple heuristic adjustment, not gradient descent

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - Reason: Adaptive logic with bounded constraints and normalization
  - **Skills**: [`clean-architecture`]
  - `clean-architecture`: Weight adjustment is pure business logic with clear invariants

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 7, 8)
  - **Blocks**: Task 10
  - **Blocked By**: Task 5

  **References**:

  **Pattern References**:
  - `packages/opencode-learning-engine/src/index.js:PatternExtractor` — Pattern extraction with feedback; adapt for weight adjustment feedback
  - `packages/opencode-learning-engine/src/index.js:OrchestrationAdvisor` — Advice caching (5min TTL, 500 max); adapt for weight caching
  - `packages/opencode-hyper-param-learner/` — Existing hyperparameter learning; understand interface before building weight optimizer

  **API/Type References**:
  - `packages/opencode-learning-engine/src/memory-scoring.js:DEFAULT_WEIGHTS` — Default weights that adaptive optimizer starts from
  - `packages/opencode-learning-engine/src/memory-scoring.js:MemoryScoringPipeline` — Target for wiring adaptive weights

  **WHY Each Reference Matters**:
  - `PatternExtractor`: Shows how the learning engine processes feedback — weight adjustment follows similar patterns
  - `OrchestrationAdvisor`: Caching pattern for optimization results — weight cache follows same approach
  - `hyper-param-learner`: Existing parameter learning infrastructure — adaptive weights should integrate with this

  **Acceptance Criteria**:

  Agent-Executed QA Scenarios:

  ```
  Scenario: Weights adjust based on user feedback
  Tool: Bash (bun test)
  Preconditions: None
  Steps:
    1. Create test: packages/opencode-learning-engine/tests/adaptive-weights.test.js
    2. Initial weights: {recency: 0.4, importance: 0.35, relevance: 0.25}
    3. Feedback: user selected memory with high relevance (0.9) but low recency (0.3)
    4. Call updateWeights("project-x", feedback)
    5. New weights = getWeights("project-x")
    6. Assert: new weights.relevance > 0.25
    7. Assert: new weights.recency < 0.4
    8. Assert: sum of weights === 1.0 (within 0.001)
    9. Run: bun test packages/opencode-learning-engine/tests/adaptive-weights.test.js
  Expected Result: Weights shift toward relevant factor, normalized
  Evidence: .sisyphus/evidence/task-9-adaptive-shift.txt

  Scenario: Weights bounded in [0.1, 0.6]
  Tool: Bash (bun test)
  Preconditions: Weights near boundary
  Steps:
    1. Set weights.relevance = 0.58
    2. Feedback that would increase relevance by 0.05
    3. Call updateWeights()
    4. Assert: weights.relevance === 0.6 (clamped, not 0.63)
    5. Assert: remaining weight distributed to maintain sum = 1.0
    6. Run: bun test packages/opencode-learning-engine/tests/adaptive-weights.test.js
  Expected Result: Bounds enforced even under extreme feedback
  Evidence: .sisyphus/evidence/task-9-adaptive-bounds.txt

  Scenario: Reset weights returns to defaults
  Tool: Bash (bun test)
  Preconditions: Custom weights set
  Steps:
    1. Call resetWeights("project-x")
    2. Call getWeights("project-x")
    3. Assert: weights equal DEFAULT_WEIGHTS
    4. Run: bun test packages/opencode-learning-engine/tests/adaptive-weights.test.js
  Expected Result: Defaults restored
  Evidence: .sisyphus/evidence/task-9-adaptive-reset.txt

  Scenario: Weight history is tracked
  Tool: Bash (bun test)
  Preconditions: Multiple adjustments made
  Steps:
    1. Make 3 updateWeights() calls
    2. Call getWeightHistory("project-x")
    3. Assert: history.length === 3
    4. Assert: each entry has {before, after, feedback, adjusted_at}
    5. Run: bun test packages/opencode-learning-engine/tests/adaptive-weights.test.js
  Expected Result: Full adjustment history available for debugging
  Evidence: .sisyphus/evidence/task-9-adaptive-history.txt
  ```

  **Commit**: YES
  - Message: `feat(memory): add adaptive weight optimizer with bounded adjustments`
  - Files: `packages/opencode-learning-engine/src/adaptive-weights.js`, `packages/opencode-learning-engine/tests/adaptive-weights.test.js`
  - Pre-commit: `bun test packages/opencode-learning-engine/tests/adaptive-weights.test.js`

---

- [ ] 10. End-to-End Integration + Regression

  **What to do**:
  - Wire all components together in `packages/opencode-integration-layer/src/bootstrap.js`:
    - Initialize `MemorySchema` → `MemoryPaths` → `DegradedModeHandler` → `MemoryBridge` → `MemoryScoringPipeline` → `TemporalIntelligence` → `MetaMemoryBridge` → `AdaptiveWeightOptimizer`
  - Create `packages/opencode-integration-layer/src/memory-api.js` — Unified public API:
    - `async saveMemory(record)` — delegates to MemoryBridge.save()
    - `async recallMemory(query, options)` — delegates to MemoryBridge.recall(), enhanced by TemporalIntelligence and MetaMemoryBridge
    - `async searchMemories(query, options)` — Vector search with scoring
    - `async consolidateMemories(options)` — Delegates to consolidation script
    - `getMemoryStatus()` — Returns system health: Supermemory availability, queue size, last consolidation
  - Create integration test: `packages/opencode-integration-layer/tests/memory-integration.test.js`:
    - Test full write → score → recall → enrich pipeline
    - Test degraded mode activation and recovery
    - Test consolidation idempotency
  - Run full regression: `bun test` — ensure no existing tests break
  - Run `bun run governance:check` — ensure governance gates pass
  - Update `packages/opencode-integration-layer/src/index.js` to export new memory API

  **Must NOT do**:
  - Do NOT break existing context-bridge or context-governor functionality
  - Do NOT modify existing MCP tool registrations (only ADD new ones)
  - Do NOT skip governance:check — this is the final gate

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
  - Reason: Integration of 7+ components with regression verification
  - **Skills**: [`clean-architecture`, `verification-before-completion`]
  - `clean-architecture`: Integration must maintain clean boundaries between components
  - `verification-before-completion`: Final task — MUST verify all acceptance criteria before declaring done
  - **Skills Evaluated but Omitted**:
  - `e2e-testing`: We are using unit + integration tests, not browser E2E

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (final, sequential)
  - **Blocks**: None (final task)
  - **Blocked By**: Tasks 4, 6, 7, 8, 9

  **References**:

  **Pattern References**:
  - `packages/opencode-integration-layer/src/bootstrap.js` — Existing bootstrap pattern; add memory initialization here
  - `packages/opencode-integration-layer/src/context-bridge.js` — Integration pattern for bridge modules; follow same structure for memory API
  - `packages/opencode-integration-layer/src/index.js` — Export pattern; add memory API exports

  **API/Type References**:
  - `packages/opencode-integration-layer/src/memory-bridge.js:MemoryBridge` — Core write/recall
  - `packages/opencode-learning-engine/src/memory-scoring.js:MemoryScoringPipeline` — Scoring
  - `packages/opencode-learning-engine/src/temporal-intelligence.js:TemporalIntelligence` — Temporal enrichment
  - `packages/opencode-memory-graph/src/meta-memory-bridge.js:MetaMemoryBridge` — Graph enrichment
  - `packages/opencode-learning-engine/src/adaptive-weights.js:AdaptiveWeightOptimizer` — Adaptive weights
  - `packages/opencode-integration-layer/src/memory-degraded.js:DegradedModeHandler` — Fallback handler

  **WHY Each Reference Matters**:
  - `bootstrap.js`: Where all memory components get wired together — the single entry point
  - `context-bridge.js`: Pattern reference for how to expose bridge APIs
  - All component files: These are the actual modules being integrated — must understand their interfaces

  **Acceptance Criteria**:

  Agent-Executed QA Scenarios:

  ```
  Scenario: Full write-score-recall-enrich pipeline
  Tool: Bash (bun test)
  Preconditions: All previous tasks complete; Supermemory mocked
  Steps:
    1. Run: bun test packages/opencode-integration-layer/tests/memory-integration.test.js
    2. Test: saveMemory({project: "x", type: "fact", content: "User prefers dark mode"}) → {status: 'saved'}
    3. Test: recallMemory("dark mode preferences", {project: "x"}) → returns saved memory
    4. Test: returned memory has .score.total > 0
    5. Test: returned memory has .metaMemory.relatedMemories (if graph populated)
    6. Assert: all assertions pass
  Expected Result: Full pipeline works end-to-end
  Evidence: .sisyphus/evidence/task-10-integration-pipeline.txt

  Scenario: Degraded mode activates and recovers
  Tool: Bash (bun test)
  Preconditions: Integration test environment
  Steps:
    1. Mock Supermemory as unavailable
    2. saveMemory() → {status: 'queued'}
    3. getMemoryStatus() → {available: false, queuedCount: 1}
    4. Mock Supermemory as available again
    5. Wait for flush interval
    6. getMemoryStatus() → {available: true, queuedCount: 0}
    7. recallMemory() → returns flushed memory
  Expected Result: Graceful degradation and automatic recovery
  Evidence: .sisyphus/evidence/task-10-integration-degraded.txt

  Scenario: No regression in existing tests
  Tool: Bash
  Preconditions: All code changes complete
  Steps:
    1. Run: bun test
    2. Assert: exit code 0 (all 253+ tests pass)
    3. Run: bun run governance:check
    4. Assert: exit code 0
  Expected Result: Zero regressions across full test suite
  Evidence: .sisyphus/evidence/task-10-regression.txt

  Scenario: Memory API exported from integration layer
  Tool: Bash
  Preconditions: Package updated
  Steps:
    1. Run: bun -e "import * as layer from './packages/opencode-integration-layer/src/index.js'; console.log(typeof layer.saveMemory)"
    2. Assert: output is 'function'
    3. Run: bun -e "import * as layer from './packages/opencode-integration-layer/src/index.js'; console.log(typeof layer.recallMemory)"
    4. Assert: output is 'function'
    5. Run: bun -e "import * as layer from './packages/opencode-integration-layer/src/index.js'; console.log(typeof layer.getMemoryStatus)"
    6. Assert: output is 'function'
  Expected Result: All memory API functions exported
  Evidence: .sisyphus/evidence/task-10-exports.txt
  ```

  **Commit**: YES
  - Message: `feat(memory): integrate all memory subsystems with unified API and regression tests`
  - Files: `packages/opencode-integration-layer/src/memory-api.js`, `packages/opencode-integration-layer/src/bootstrap.js` (updated), `packages/opencode-integration-layer/src/index.js` (updated), `packages/opencode-integration-layer/tests/memory-integration.test.js`
  - Pre-commit: `bun test && bun run governance:check`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(memory): add canonical memory schema with validation and idempotency` | memory-schema.js, memory-schema.test.js | `bun test memory-schema.test.js` |
| 2 | `feat(memory): add degraded-mode fallback for Supermemory unavailability` | memory-degraded.js, memory-degraded.test.js | `bun test memory-degraded.test.js` |
| 3 | `feat(memory): add platform-aware path resolution for memory subsystems` | memory-paths.js, memory-paths.test.js | `bun test memory-paths.test.js` |
| 4 | `feat(memory): add unified memory write/recall bridge with degraded fallback` | memory-bridge.js, memory-bridge.test.js | `bun test memory-bridge.test.js` |
| 5 | `feat(memory): add deterministic scoring pipeline with exact test fixtures` | memory-scoring.js, memory-scoring.test.js | `bun test memory-scoring.test.js` |
| 6 | `feat(memory): add meta-memory pointer layer enforcing derived-only invariant` | meta-memory-bridge.js, meta-memory-bridge.test.js | `bun test meta-memory-bridge.test.js` |
| 7 | `feat(memory): add temporal intelligence layer for context-aware ranking` | temporal-intelligence.js, temporal-intelligence.test.js | `bun test temporal-intelligence.test.js` |
| 8 | `feat(memory): add consolidation script with idempotent dry-run and audit trail` | memory-consolidate.mjs | `node memory-consolidate.mjs --dry-run` |
| 9 | `feat(memory): add adaptive weight optimizer with bounded adjustments` | adaptive-weights.js, adaptive-weights.test.js | `bun test adaptive-weights.test.js` |
| 10 | `feat(memory): integrate all memory subsystems with unified API and regression tests` | memory-api.js, bootstrap.js, index.js, memory-integration.test.js | `bun test && bun run governance:check` |

---

## Success Criteria

### Verification Commands

```bash
# Schema validation
bun test packages/opencode-integration-layer/tests/memory-schema.test.js
# Expected: X tests, 0 failures

# Scoring determinism
bun test packages/opencode-learning-engine/tests/memory-scoring.test.js
# Expected: exact values match (no tolerance assertions)

# Consolidation idempotency
node scripts/memory-consolidate.mjs --project sm_project_default --dry-run --format json
# Expected: exit 0, JSON with dedupedCount/mergedCount/decayedCount/unchangedCount

# Full regression
bun test
# Expected: 253+ tests, 0 failures

# Governance
bun run governance:check
# Expected: exit 0
```

### Final Checklist

- [ ] All "Must Have" present: canonical schema, unified bridge, deterministic scoring, idempotent consolidation, platform-aware paths, degraded mode
- [ ] All "Must NOT Have" absent: no new vector DB, no real-time sync, no UI changes, no agent protocol changes, no raw content in graph
- [ ] All tests pass: `bun test` exits 0
- [ ] Governance passes: `bun run governance:check` exits 0
- [ ] Core retention rule preserved: retention='core' → weight ALWAYS 1.0
- [ ] Consolidation is idempotent: dry-run produces identical output on repeated runs
- [ ] Meta-memory stores only pointers: no raw content in graph nodes
