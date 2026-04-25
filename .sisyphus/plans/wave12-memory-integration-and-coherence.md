# Wave 12: Agent Memory Integration & System Coherence

**Created**: 2026-04-22
**Status**: Draft
**Wave Type**: Integration + Coherence

---

## Context

Wave 11 completed the memory system overhaul with canonical schema, unified bridge, scoring, meta-memory, temporal intelligence, and adaptive weights. However, several integration gaps remain:

1. **Memory system is built but not wired** - `MemoryBridge` exists but no agents actively use it for context injection
2. **Documentation drift** - 47 AGENTS.md files with config fragments that don't match current implementation
3. **Config fragmentation** - 6+ config files with overlapping concerns

---

## Tasks

### Wave 12.1: Wire Memory Into Agent Context Injection
**Priority**: P0 (High)

- [ ] Integrate `MemoryBridge` into `IntegrationLayer` for agent context injection
- [ ] Create `MemoryContextProvider` that surfaces relevant memories based on current task
- [ ] Wire `supermemory_recall` into agent suggestion pipeline
- [ ] Add memory-based context enrichment before task execution

**Files to change**:
- `packages/opencode-integration-layer/src/index.js` - add MemoryBridge export and context provider
- `packages/opencode-sisyphus-state/src/orchestration-engine.js` - inject memory context

### Wave 12.2: Consolidate Configuration Fragmentation
**Priority**: P1 (Medium)

- [ ] Audit all config files: `opencode.json`, `central-config.json`, `oh-my-opencode.json`, `config.yaml`, etc.
- [ ] Identify duplicate/overlapping settings
- [ ] Create single `opencode-config/schema.json` as canonical source
- [ ] Deprecate redundant config keys with migration path

**Files to audit**:
- `opencode-config/` directory
- Root config files (opencode.json, etc.)
- Package-level configs

### Wave 12.3: Documentation Coherence Pass
**Priority**: P2 (Low)

- [ ] Audit AGENTS.md files for stale config references
- [ ] Update 3 main workspace AGENTS.md files:
  - `packages/opencode-integration-layer/AGENTS.md`
  - `packages/opencode-model-manager/AGENTS.md`
  - `AGENTS.md` (root)
- [ ] Update root AGENTS.md to reflect Wave 11 memory system
- [ ] Note: `local/oh-my-opencode/AGENTS.md` (36 files) are external plugin - do not modify

**Files to change**:
- `packages/opencode-integration-layer/AGENTS.md` - add memory system docs
- `packages/opencode-model-manager/AGENTS.md` - update model config
- `AGENTS.md` - update with memory system reference

### Wave 12.4: Performance Regression Baseline
**Priority**: P1 (Medium)

- [ ] Establish performance baselines for:
  - Memory recall latency (<50ms target)
  - Context injection overhead (<10ms)
  - Token consumption per session
- [ ] Add performance regression tests
- [ ] Create `scripts/performance-baseline.mjs`

---

## Guardrails

- **NO new packages** - only wire existing components
- **NO breaking changes** - add, don't modify existing APIs
- **NO UI changes** - dashboard work deferred
- **Config consolidation must be backward compatible** - deprecate, don't delete

---

## Critical Path

```
Task 1 (Memory Context Provider) → Task 4 (Performance Baseline)
     ↓
Task 2 (Config Consolidation) → Task 3 (Documentation)
```

---

## Dependencies

- Wave 11 memory system must be complete (✅ Done)
- No external blockers

---

## Success Criteria

1. Agents can recall relevant memories for current task context
2. Memory context injection adds <10ms latency
3. Config files consolidated with clear precedence
4. Documentation reflects actual implementation
5. All tests pass (baseline: 253 tests)
6. Performance regression suite green