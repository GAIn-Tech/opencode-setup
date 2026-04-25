# Verified Memory Graph (VMG) Implementation Plan

## TL;DR

**Objective**: Build a hybrid memory system combining SQLite (fast, offline) + Neo4j (graph, causal) with typed facts, provenance, confidence scoring, and contradiction detection.

**Core Innovation**: Every memory is a "fact" with evidence, not just text. Solve the "stale memory" problem plaguing competitors.

**Timeline**: 12 weeks (Phase 3 of migration)
**Dependencies**: opencode-cli-v2 bootstrap (Phase 1), codebase-memory activation (Phase 2)
**Deliverables**: Hybrid storage, VMG core, advanced features

---

## Context

### Original Request
Create bleeding-edge memory system with:
- ✅ Graph database (Neo4j chosen)
- ✅ Hybrid architecture (SQLite + Neo4j)
- ✅ Cryptographic verification
- ✅ Full creative control (own the stack)
- ✅ Migration version only (no changes to existing)

### Why This Matters
Current AI coding tools have a critical flaw: **memory rot**. They store context but:
- Don't track where facts came from (no provenance)
- Can't detect contradictions (old vs new decisions)
- Don't expire stale information
- Can't reason about causality ("X caused Y")

**VMG fixes this** by treating memory as verifiable facts.

---

## Work Objectives

### Core Objective
Create the industry's first **Verified Memory Graph** for AI coding - a system where every "fact" has provenance, confidence, TTL, and contradiction detection.

### Concrete Deliverables
1. **Hybrid Storage Layer**: SQLite (Tier 1) + Neo4j (Tier 2) + Object Storage (Tier 3)
2. **VMG Core**: Fact schema, provenance tracking, confidence scoring
3. **Sync Engine**: Async SQLite ↔ Neo4j synchronization
4. **Query Interface**: Unified API over hybrid storage
5. **Contradiction Detection**: Automatic stale memory identification
6. **Cryptographic Verification**: Signed facts for audit/replay

### Definition of Done
```bash
# All tests pass
bun test packages/opencode-memory-v2

# Neo4j connectivity verified
bun run test:neo4j

# End-to-end sync works
bun run test:sync

# VMG features functional
bun run test:vmg
```

### Must Have
- [ ] SQLite schema for local repo symbols
- [ ] Neo4j schema for cross-repo/causal facts
- [ ] Fact schema with provenance/confidence/TTL
- [ ] Async sync between tiers
- [ ] Contradiction detection algorithm
- [ ] Cryptographic signing (ed25519)
- [ ] Unified query API

### Must NOT Have (Guardrails)
- NO migration from old opencode memory (greenfield only)
- NO external service dependencies (except Neo4j which we control)
- NO blocking sync operations (all async)
- NO unlimited TTL (all facts expire)

---

## Verification Strategy

### Test Strategy
- **Infrastructure**: Bun test (exists)
- **Framework**: TDD for VMG logic
- **Approach**: Tests after (complex graph operations)

### Agent-Executed QA Scenarios

**Scenario: Tiered Memory Sync**
```
Tool: Bun test
Preconditions: Neo4j container running, SQLite database initialized
Steps:
1. Index repo with 100 symbols into SQLite
2. Trigger sync to Neo4j
3. Query Neo4j for symbol count
4. Assert count == 100
5. Add new symbol to SQLite
6. Trigger incremental sync
7. Query Neo4j for new symbol
8. Assert found
Expected: Bidirectional sync works correctly
Evidence: test-output-sync.json
```

**Scenario: Fact Verification Chain**
```
Tool: Bun test
Preconditions: VMG initialized with test facts
Steps:
1. Create fact: "auth uses bcrypt" (provenance: PR #123, confidence: 0.95)
2. Create conflicting fact: "auth uses argon2" (provenance: PR #456, confidence: 0.90)
3. Run contradiction detection
4. Assert conflict detected
5. Query which fact is newer
6. Assert newer fact flagged as current
Expected: Contradictions detected, newer wins
Evidence: test-output-contradiction.json
```

**Scenario: Cryptographic Signing**
```
Tool: Bun test
Steps:
1. Generate ed25519 keypair
2. Sign fact with private key
3. Verify signature with public key
4. Assert verification passes
5. Tamper with fact content
6. Assert verification fails
Expected: Facts immutably signed
Evidence: test-output-crypto.json
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Weeks 1-2): Foundation
├── Task 1: Neo4j Infrastructure
│   ├── Docker container setup
│   └── Connection pool implementation
└── Task 2: SQLite Schema Extension
    ├── Extend codebase-memory schema
    └── Add provenance fields

Wave 2 (Weeks 3-4): Core VMG
├── Task 3: Neo4j Schema Design
│   ├── Node types (Fact, Source, Session)
│   └── Edge types (PROVES, CONTRADICTS, SUPERSEDES)
├── Task 4: Fact Schema Implementation
│   ├── Provenance tracking
│   └── Confidence scoring
└── Task 5: Sync Engine
    └── Async SQLite ↔ Neo4j sync

Wave 3 (Weeks 5-8): Advanced Features
├── Task 6: Contradiction Detection
├── Task 7: Cryptographic Signing
├── Task 8: Query Interface
└── Task 9: Performance Optimization

Wave 4 (Weeks 9-12): Production Hardening
├── Task 10: Backup/Restore
├── Task 11: Monitoring/Observability
├── Task 12: Documentation
└── Task 13: Integration Tests
```

### Dependency Matrix
| Task | Depends On | Blocks |
|------|------------|--------|
| 1 | None | 3, 5 |
| 2 | None | 5 |
| 3 | 1 | 4, 6 |
| 4 | 3 | 6, 7, 8 |
| 5 | 1, 2 | 8 |
| 6 | 4 | - |
| 7 | 4 | - |
| 8 | 4, 5 | 10-13 |
| 9 | 4, 5 | 10-13 |
| 10-13 | 8, 9 | - |

---

## TODOs

### Task 1: Neo4j Infrastructure
**What to do:**
- Add Neo4j to docker-compose.yml
- Implement connection pooling
- Create health check endpoint
- Add environment-based configuration

**Recommended Agent Profile:**
- Category: `unspecified-high`
- Skills: `docker-containerization`, `database-design`

**References:**
- Neo4j Docker docs: https://neo4j.com/docs/operations-manual/current/docker/
- Connection pooling patterns: packages/opencode-tool-usage-tracker/src/

**Acceptance Criteria:**
- [ ] `docker-compose up neo4j` starts successfully
- [ ] Connection pool manages 10+ concurrent connections
- [ ] Health check returns 200 within 5s

**Agent-Executed QA:**
```
Scenario: Neo4j container startup
Tool: Bash (docker)
Steps:
1. docker-compose up -d neo4j
2. sleep 10
3. curl -s http://localhost:7474
4. Assert response contains "Neo4j"
5. docker-compose down
Evidence: neo4j-startup.log
```

---

### Task 2: SQLite Schema Extension
**What to do:**
- Extend codebase-memory GraphStore
- Add provenance table
- Add confidence score to nodes
- Add TTL/expiration fields

**Recommended Agent Profile:**
- Category: `unspecified-high`
- Skills: `database-design`, `sqlite`

**References:**
- Current schema: packages/opencode-codebase-memory/src/graph-store.js:6-49
- Migration patterns: packages/opencode-codebase-memory/src/

**Acceptance Criteria:**
- [ ] Schema migrations run automatically
- [ ] Provenance queryable
- [ ] Expired nodes filtered by default

---

### Task 3: Neo4j Schema Design
**What to do:**
Design property graph schema:
- Nodes: Fact, Source, Session, Agent
- Edges: PROVES, CONTRADICTS, SUPERSEDES, CAUSED_BY, DEPENDS_ON

**Recommended Agent Profile:**
- Category: `unspecified-high`
- Skills: `database-design`, `neo4j`

**References:**
- Graph data modeling: https://neo4j.com/developer/guide-data-modeling/
- Cypher manual: https://neo4j.com/docs/cypher-manual/current/

**Acceptance Criteria:**
- [ ] Cypher schema defined
- [ ] Constraints/indexes created
- [ ] Sample queries functional

---

### Task 4: Fact Schema Implementation
**What to do:**
Implement fact structure:
```typescript
interface Fact {
  id: string;
  content: string;
  type: 'architectural' | 'operational' | 'convention' | 'historical';
  provenance: {
    source: string;
    sessionId: string;
    timestamp: Date;
    agentId: string;
  };
  confidence: number; // 0-1
  ttl: Duration;
  expiresAt: Date;
  signature: string; // ed25519
  contradictions: string[]; // IDs
}
```

**Recommended Agent Profile:**
- Category: `unspecified-high`
- Skills: `database-design`, `api-design-principles`

**Acceptance Criteria:**
- [ ] TypeScript interfaces defined
- [ ] Validation schema implemented
- [ ] Serialization/deserialization working

---

### Task 5: Sync Engine
**What to do:**
Build async SQLite ↔ Neo4j synchronization:
- Event-driven sync triggers
- Batch operations for performance
- Conflict resolution strategy
- Backpressure handling

**Recommended Agent Profile:**
- Category: `unspecified-high`
- Skills: `database-migration`, `event-sourcing`

**Acceptance Criteria:**
- [ ] Sync completes within 5s for 1000 nodes
- [ ] No data loss on interruption
- [ ] Resumable from checkpoint

---

### Task 6: Contradiction Detection
**What to do:**
Implement contradiction detection:
- Same subject, different values
- Temporal ordering (newer vs older)
- Confidence-based resolution
- User notification

**Algorithm sketch:**
```typescript
function detectContradictions(fact: Fact): Fact[] {
  // Find facts with same subject/key
  const candidates = neo4j.query(`
    MATCH (f:Fact {subject: $subject})
    WHERE f.id <> $id
    RETURN f
  `, { subject: fact.subject, id: fact.id });
  
  // Check for value conflicts
  return candidates.filter(c => 
    c.value !== fact.value && 
    c.confidence > MIN_CONFIDENCE
  );
}
```

**Acceptance Criteria:**
- [ ] Detects 90%+ of contradictions
- [ ] Resolution time < 100ms
- [ ] Audit trail maintained

---

### Task 7: Cryptographic Signing
**What to do:**
- Generate ed25519 keypairs per agent/session
- Sign facts on creation
- Verify signatures on retrieval
- Key rotation strategy

**Recommended Agent Profile:**
- Category: `unspecified-high`
- Skills: `api-security`, `secure-coding`

**Acceptance Criteria:**
- [ ] All facts signed
- [ ] Verification < 10ms
- [ ] Key rotation without data loss

---

### Task 8: Query Interface
**What to do:**
Create unified API:
```typescript
interface VMGQuery {
  // Unified over SQLite + Neo4j
  querySymbols(pattern: string): Promise<Symbol[]>;
  getFact(id: string): Promise<Fact | null>;
  findContradictions(fact: Fact): Promise<Fact[]>;
  traceCausality(event: string): Promise<Fact[]>;
}
```

**Acceptance Criteria:**
- [ ] API implemented
- [ ] Response time < 100ms for local queries
- [ ] Response time < 500ms for graph queries

---

### Task 9: Performance Optimization
**What to do:**
- Query profiling
- Index optimization
- Caching layer
- Connection pooling tuning

**Acceptance Criteria:**
- [ ] P95 latency < 200ms
- [ ] Supports 1000+ concurrent queries
- [ ] Memory usage < 2GB

---

### Tasks 10-13: Production Hardening
**What to do:**
- Backup/restore procedures
- Metrics and monitoring
- Documentation
- Integration tests

**Acceptance Criteria:**
- [ ] Disaster recovery tested
- [ ] Dashboard shows memory health
- [ ] Documentation complete
- [ ] 95%+ test coverage

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|------------|
| 1 | `feat(vmg): add neo4j infrastructure` | docker-compose.yml, src/neo4j/ | bun test:neo4j |
| 2 | `feat(vmg): extend sqlite schema` | src/graph-store.js | bun test:sqlite |
| 3 | `feat(vmg): neo4j schema design` | src/neo4j/schema.cypher | bun test:schema |
| 4 | `feat(vmg): fact schema implementation` | src/fact.ts | bun test:fact |
| 5 | `feat(vmg): sync engine` | src/sync/ | bun test:sync |
| 6 | `feat(vmg): contradiction detection` | src/contradiction/ | bun test:contradiction |
| 7 | `feat(vmg): cryptographic signing` | src/crypto/ | bun test:crypto |
| 8 | `feat(vmg): query interface` | src/query/ | bun test:query |
| 9 | `perf(vmg): optimization` | src/cache/, src/pool/ | bun test:perf |
| 10-13 | `chore(vmg): production hardening` | docs/, tests/integration/ | bun test:all |

---

## Success Criteria

### Verification Commands
```bash
# Infrastructure
bun test packages/opencode-memory-v2/test/neo4j.test.ts

# Core features
bun test packages/opencode-memory-v2/test/vmg.test.ts

# Integration
bun test packages/opencode-memory-v2/test/integration.test.ts

# Performance
bun run bench:vmg
```

### Final Checklist
- [ ] All tests passing
- [ ] Neo4j cluster deployable
- [ ] Documentation complete
- [ ] Benchmarks meet targets
- [ ] Security audit passed

---

## Strategic Notes

### Why Hybrid?
- **SQLite**: Zero-config, offline-first, fast for local symbols
- **Neo4j**: Complex graph queries, causal reasoning, distributed
- **Best of both**: Local speed + global intelligence

### Why Not Just Neo4j?
- SQLite works offline (critical for local dev)
- SQLite is faster for simple lookups
- Neo4j operational overhead

### Why Not Just SQLite?
- Can't do complex graph traversals efficiently
- No native causal reasoning
- Single-file limits for massive codebases

### Competitive Advantage
**No competitor has this**. Claude Code has memory but no verification. Cursor has codebase understanding but no causal reasoning. This is genuinely differentiated.

---

**Plan Status**: Ready for review
**Next Action**: Approve plan → Begin Task 1 (Neo4j Infrastructure)
