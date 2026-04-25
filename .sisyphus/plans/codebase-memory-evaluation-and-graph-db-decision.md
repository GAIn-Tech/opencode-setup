# Codebase-Memory Evaluation & Graph DB Decision Analysis

## Executive Summary

**Recommendation**: **ADOPT codebase-memory as foundation, MIGRATE to hybrid SQLite+Neo4j architecture for VMG (Verified Memory Graph)**

The orphaned `opencode-codebase-memory` package is production-ready, well-designed, and provides immediate value. Rather than discarding it, we should:
1. **Activate** it now for semantic codebase understanding
2. **Evolve** it toward our VMG architecture with Neo4j for complex graph operations
3. **Maintain** SQLite for local, fast, offline-first indexing
4. **Add** Neo4j for distributed, causal reasoning, and cross-repo analysis

---

## Part 1: Codebase-Memory Constitution & Design Evaluation

### Architecture Assessment

| Aspect | Evaluation | Grade |
|--------|------------|-------|
| **Separation of Concerns** | Clear: Indexer → GraphStore → Parser | A |
| **Data Model** | Nodes + Edges + Files + FTS5 - proper graph schema | A |
| **Incremental Design** | SHA256 content hash for change detection | A |
| **Storage Layer** | Bun:sqlite with WAL mode, FTS5 - solid choices | A |
| **CLI Interface** | Full CRUD + query + impact analysis | B+ |
| **Language Support** | TypeScript/JS only via @typescript-eslint | C+ |
| **Distribution** | Single-file SQLite (local only) | B- |
| **Test Coverage** | Present but needs expansion | B |

### Design Philosophy Alignment

**✅ ALIGNS with our principles:**
- **Offline-first**: SQLite works without network
- **Observable**: Clean schema, queryable
- **Incremental**: Content-hash based updates
- **Graph-native**: Proper edges + nodes model
- **Fast**: SQLite with WAL, prepared statements
- **Self-contained**: Single repo = single .db file

**⚠️ NEEDS ENHANCEMENT for our goals:**
- **No causal edges** (just calls/imports, not "caused failure")
- **No confidence scoring** (all facts treated equally)
- **No TTL/retention** (infinite growth)
- **No provenance tracking** (who/when/why was this learned)
- **Single-tenant** (no multi-repo correlation)
- **No cryptographic verification** (data integrity)

### Technical Debt Assessment

**Low Risk:**
- Clean, modern code (ES2020+)
- Proper async/await patterns
- Good error handling
- Atomic operations

**Medium Risk:**
- Depends on @typescript-eslint (large dependency)
- No connection pooling (single SQLite handle)
- FTS5 rebuild on every index (performance)

**High Risk (if we DON'T enhance):**
- **Orphaned status** = no maintenance
- No conflict detection for concurrent indexing
- No backup/restore strategy

### Verdict: DESIGN QUALITY

**Score: 7.5/10**

This is **production-grade infrastructure** that was prematurely orphaned. The core design is sound and aligns with our needs. With targeted enhancements (causal edges, confidence scoring, Neo4j hybrid), it becomes the foundation for our VMG.

---

## Part 2: Graph Database Decision - Neo4j Pro-Con Analysis

### Decision: SQLite vs Neo4j vs Hybrid

| Criterion | SQLite | Neo4j | Hybrid (Recommended) |
|-----------|--------|-------|---------------------|
| **Offline Capability** | ✅ Native | ❌ Requires server | ✅ SQLite offline, Neo4j optional |
| **Graph Queries** | ⚠️ Recursive CTEs | ✅ Native Cypher | ✅ Best of both |
| **Causal Reasoning** | ❌ No native support | ✅ Path finding | ✅ Neo4j for complex paths |
| **Scalability** | ⚠️ Single file | ✅ Distributed | ✅ Shard by repo |
| **Installation** | ✅ Zero deps | ⚠️ Docker/server | ✅ SQLite default, Neo4j opt-in |
| **Cost** | ✅ Free | ⚠️ License for enterprise | ✅ SQLite free, Neo4j managed |
| **ACID** | ✅ Full | ✅ Full | ✅ Both ACID |
| **Vector + Graph** | ❌ Separate | ✅ Native (GDS) | ✅ Combined in Neo4j |

---

### Neo4j: Detailed Pro-Con

#### PROS ✅

**1. Native Graph Operations**
```cypher
// Find all callers of a function up to 3 levels
MATCH (s:Symbol {name: 'updateUser'})<-[:CALLS*1..3]-(caller)
RETURN caller.name, length(path) as depth
```
- SQLite requires recursive CTEs (complex, slower)
- Neo4j optimizes graph traversals natively

**2. Causal Reasoning Support**
```cypher
// Find root cause of test failure
MATCH (error:Error {type: 'TestFailed'})-[:CAUSED_BY]->(cause:Change)
MATCH path = shortestPath((cause)-[:DEPENDS_ON*]->(root))
RETURN root, path
```
- Essential for our "Verified Memory Graph" concept
- SQLite cannot do this efficiently

**3. Vector + Graph Combined**
- Neo4j GDS (Graph Data Science) supports embeddings
- Hybrid semantic + structural retrieval
- Single query: "similar symbols that call X"

**4. Distributed/Multi-Repo**
- Can correlate across repos (our mono → extracted model)
- Cluster support for scale
- Fine-grained security (RBAC)

**5. Schema Flexibility**
- Property graph model (nodes have arbitrary properties)
- Dynamic relationship types
- Easy to add confidence, TTL, provenance fields

**6. Enterprise Features**
- Backup/restore
- Monitoring
- Query profiling
- ACID compliance

**7. Ecosystem**
- Excellent Python/JS drivers
- Cypher query language (intuitive)
- Graph visualization (Bloom)
- APOC procedures (utility library)

#### CONS ❌

**1. Operational Complexity**
```yaml
# Requires additional infrastructure
services:
  neo4j:
    image: neo4j:5-enterprise
    environment:
      - NEO4J_AUTH=neo4j/password
      - NEO4J_PLUGINS=["apoc", "gds"]
    ports:
      - "7474:7474"  # HTTP
      - "7687:7687"  # Bolt
    volumes:
      - neo4j_data:/data
```
- Not "zero config" like SQLite
- Memory-hungry (minimum 2GB recommendation)
- Requires Docker or managed service

**2. License Cost (Enterprise)**
- Community Edition: free (no GDS, no clustering)
- Enterprise: $$$ for causal clustering, GDS, security
- For our use case: Community might suffice

**3. Network Dependency**
- Requires server connection
- Adds latency vs local SQLite
- Offline mode requires local Neo4j (heavy)

**4. Learning Curve**
- Cypher is different from SQL
- Graph modeling requires mindset shift
- Team training needed

**5. Data Migration Complexity**
- SQLite → Neo4j requires ETL
- Schema mapping (tables → nodes/edges)
- Performance tuning for import

**6. Backup/Restore Different Model**
- Neo4j backup != SQLite file copy
- Requires specific tools/procedures

**7. Bun/TypeScript Integration**
- Node.js driver available
- Bun compatibility needs verification
- Type definitions present but need testing

---

## Part 3: Hybrid Architecture Recommendation

### The "Tiered Memory" Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                    TIER 1: WORKING MEMORY                    │
│                    (SQLite - Local, Fast)                    │
├─────────────────────────────────────────────────────────────┤
│ • Current repo symbol index                                  │
│ • Recent file changes                                        │
│ • Active session context                                     │
│ • Blast radius queries                                       │
│                                                              │
│  Use Case: Code navigation, impact analysis, autocomplete    │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Sync (async)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  TIER 2: SEMANTIC MEMORY                       │
│                  (Neo4j - Graph, Causal)                     │
├─────────────────────────────────────────────────────────────┤
│ • Cross-repo relationships                                   │
│ • Causal edges (X caused Y)                                │
│ • Long-term knowledge graph                                  │
│ • Verified facts with confidence                           │
│ • Contradiction detection                                    │
│                                                              │
│  Use Case: Root cause analysis, learning, audit trail        │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Archive (cold storage)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  TIER 3: ARCHIVAL MEMORY                     │
│                  (Object Storage - Cheap)                    │
├─────────────────────────────────────────────────────────────┤
│ • Historical traces                                        │
│ • Full execution ledgers                                   │
│ • Compliance archives                                      │
│                                                              │
│  Use Case: Audit, replay, compliance                         │
└─────────────────────────────────────────────────────────────┘
```

### Sync Strategy

```typescript
// Async synchronization between tiers
interface MemorySync {
  // Real-time: SQLite → Neo4j
  onSymbolIndexed: (symbol: Symbol) => Promise<void>;
  
  // Batch: Neo4j → Object Storage (nightly)
  archiveOldFacts: (olderThan: Date) => Promise<void>;
  
  // On-demand: Pull from Neo4j to SQLite
  hydrateLocalCache: (repo: string) => Promise<void>;
}
```

---

## Part 4: Implementation Strategy

### Phase 1: Activate Codebase-Memory (Weeks 1-2)

**Tasks:**
1. ✅ Remove `@deprecated` comment
2. ✅ Integrate into `opencode-cli-v2` adapter
3. ✅ Add to bootstrap sequence
4. ✅ Wire to agent context provider
5. ✅ Add tests

**Deliverable:** Working semantic codebase queries in CLI

### Phase 2: Add Neo4j Foundation (Weeks 3-4)

**Tasks:**
1. Add Neo4j container to docker-compose
2. Create graph schema (nodes, edges, properties)
3. Build SQLite → Neo4j ETL pipeline
4. Implement sync service
5. Add Cypher query builder

**Deliverable:** Hybrid storage working

### Phase 3: Verified Memory Graph (Weeks 5-8)

**Tasks:**
1. Add provenance tracking (who/when/why)
2. Implement confidence scoring
3. Add TTL/retention policies
4. Build contradiction detection
5. Create causal edge types
6. Add cryptographic verification

**Deliverable:** VMG v1.0 - "facts with evidence"

### Phase 4: Advanced Features (Weeks 9-12)

**Tasks:**
1. Cross-repo correlation
2. Memory quality dashboard
3. Auto-pruning with audit trail
4. Query optimization
5. Backup/restore

**Deliverable:** Production-grade memory system

---

## Part 5: Decision Matrix Summary

| Question | Answer |
|----------|--------|
| **Keep codebase-memory?** | ✅ YES - activate immediately |
| **Graph database?** | ✅ Neo4j for Tier 2 |
| **Replace SQLite?** | ❌ NO - keep for Tier 1 |
| **Hybrid approach?** | ✅ YES - best of both |
| **Neo4j Community vs Enterprise?** | Start with Community, evaluate Enterprise needs |
| **When to implement?** | Phase 2 of migration (after CLI bootstrap) |
| **Critical for v2 launch?** | No - can add post-launch |
| **Competitive advantage?** | ✅ YES - hybrid memory is differentiated |

---

## Next Steps

1. **Immediate**: Activate codebase-memory in opencode-cli-v2
2. **This Week**: Add Neo4j to docker-compose, test connectivity
3. **Next Sprint**: Implement SQLite → Neo4j sync
4. **Month 2**: Build VMG features on hybrid foundation

**Files Created:**
- This analysis document
- To be created: VMG implementation plan
- To be created: Neo4j schema design
- To be created: Migration plan from SQLite → hybrid

---

**Decision Authority**: This recommendation is ready for review and execution planning.
