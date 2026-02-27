# Draft: Memory System Deep Dive Overhaul

## Requirements (confirmed)
- Deep dive overhaul of the entire memory ecosystem
- Apply cutting-edge methodologies for efficient, precise, nuanced, adaptive long-term memory
- Target systems: Supermemory management, memory-graph (orchestration KG), meta-graph (project KG)
- Approach: unbounded and diverse — not limited to just KGs
- Improve: structure, storage, learning, and retrieval across all memory systems

## Current System Audit

### 1. Memory-Graph (opencode-memory-graph v2.1.0)
**Purpose**: Session→error bipartite graph builder from OpenCode logs
**Architecture**:
- V2: MemoryGraph with GoraphDB bridge, async API, LRU-bounded nodes/edges
- V3: MemoryGraphV3 with transactions, event emission, cascade eviction
- NodeStore: Multi-type LRU (session:5000, error:3000, tool:500, model:100, agent:200)
- EdgeStore: Dual-indexed (out+in), types: ENCOUNTERED, USES_MODEL, USES_TOOL, ORCHESTRATES, CHILD_OF
- Behavior: Ring-buffer pattern detection (transient/intermittent/persistent/resolved)
- Taxonomy: Hierarchical error classification tree
- Severity: Multi-factor scoring (0-100) — keyword, frequency, blast radius, persistence, co-occurrence
- Backfill: Scans ~/.opencode/messages/, extracts error patterns and tool usage
- **CRITICAL GAP**: Purely error-focused — no semantic memory, no success patterns, no decisions, no knowledge

### 2. Supermemory (External MCP Service)
**Purpose**: Cross-session persistent memory via MCP
**Current config**: 8 max items, 0.8 similarity threshold, keyword-filtered
**Usage pattern**: Simple save/recall via mcp_supermemory tools
**Integration**: Rudimentary — just save/recall with no intelligent management
**Data stored**: Project knowledge, preferences, error solutions, architecture decisions
**CRITICAL GAP**: No smart lifecycle, no consolidation, no pruning, no importance scoring

### 3. Learning Engine (opencode-learning-engine)
**Purpose**: Learn from sessions to improve orchestration decisions
**Architecture**:
- AntiPatternCatalog (STRONG warnings, 3-5x heavier)
- PositivePatternTracker (SOFT suggestions)
- PatternExtractor (heuristic, no embeddings)
- OrchestrationAdvisor (agent/skill routing)
- MetaAwarenessTracker (orchestration events, RL integration)
**Persistence**: Core (never decay) vs Adaptive (90-day exponential decay)
**CRITICAL GAP**: No semantic matching — all text-based heuristics

### 4. Context Governor (opencode-context-governor)
**Purpose**: Token budget tracking per session/model
**No memory integration** beyond quota signals

### 5. Orchestrate Bridge
**Purpose**: Session logging + memory-graph feeding
**JSONL streaming with byte-position tracking**
**CRITICAL GAP**: One-directional (log → graph), no retrieval path

## System-Wide Critical Gaps

### A. No Vector/Semantic Search Anywhere
- Pattern matching is exact/substring only
- No embeddings generation in any pipeline
- No cosine similarity, no vector distance
- Placeholder comments exist but no implementation

### B. No Memory Consolidation
- No short-term → long-term promotion
- No progressive summarization
- No memory merging for related items
- No hierarchical abstraction (episodic → semantic)

### C. Three Siloed Systems
- Supermemory, memory-graph, and learning engine are disconnected
- No cross-system queries or unified retrieval
- No shared memory model or taxonomy

### D. No Importance Scoring for General Memory
- Severity scoring exists only for errors
- No importance/relevance scoring for decisions, patterns, knowledge
- No recency weighting for retrieval

### E. No Temporal Intelligence
- No temporal decay for memories (only learning patterns)
- No recency-boosted retrieval
- No time-aware context assembly

### F. No Meta-Memory
- System can't answer "what do I know about X?"
- No inventory of knowledge domains
- No confidence scores on memories

## Cutting-Edge Research Findings

### Mem0 Architecture
- **Layered Memory**: Conversation (turn-scoped), Session (hours), User (permanent), Org (shared)
- **Graph Memory**: Auto-builds entity relationships from conversations
- **Conflict Resolution**: Dedup + contradiction handling on add
- **Hybrid Retrieval**: Vector search + graph relations returned together
- **Categories**: Auto-categorizes memories (personal_details, professional, etc.)
- **Immutability**: Memories can be marked immutable
- **MCP Integration**: Native MCP server for AI agent access

### Stanford Generative Agents (arXiv:2304.03442)
- **Memory Stream**: Complete record of agent experiences in natural language
- **Reflection**: Periodic synthesis of memories into higher-level reflections
- **Planning**: Dynamic behavior planning based on retrieved memories
- **Retrieval**: Scored by recency × relevance × importance
- **Importance Scoring**: LLM-assessed on 1-10 scale at creation time

### GraphRAG (Microsoft)
- **Hierarchical Knowledge Graph**: Entities → relationships → communities → summaries
- **Leiden Clustering**: Community detection for hierarchical understanding
- **Three Search Modes**: Global (holistic), Local (specific entities), DRIFT (community-enriched local)
- **Community Summaries**: Pre-computed answers for holistic questions

### Letta/MemGPT
- **Tiered Memory**: Main context window, archival storage, recall storage
- **Self-Editing**: Agent manages its own memory via tools (heartbeat, core memory append/replace)
- **Inner/Outer Loop**: Inner loop manages context, outer loop manages long-term
- **Pagination**: For browsing large memory stores

### Memory Consolidation Patterns
- **Progressive Summarization**: Layer-based compression (highlights → notes → summaries)
- **Memory Merging**: Combining related memories into coherent units
- **Hierarchical Memory**: Episodic (events) → Semantic (facts) → Procedural (skills)
- **Sleep-Inspired**: Background processing to consolidate and reorganize
- **Spaced Repetition**: Applied to AI memory for optimal retention/decay

### Retrieval Techniques
- **Hybrid Retrieval**: BM25 + dense vectors + graph traversal
- **Contextual Retrieval (Anthropic)**: Prepend document-level context to chunks
- **Self-RAG**: Agent decides when and what to retrieve
- **Multi-hop**: Follow graph relationships for complex queries
- **Temporal Awareness**: Recency-weighted retrieval scoring

## Technical Decisions
- [PENDING] Whether to implement embeddings locally or use external service
- [PENDING] Which vector store to use (SQLite-vec, FAISS, etc.)
- [PENDING] How to unify supermemory + memory-graph + learning engine
- [PENDING] Memory consolidation strategy (background vs on-demand)
- [PENDING] How to handle memory conflicts/contradictions

## Open Questions
1. What embedding model to use? (local vs API)
2. Should memory-graph expand beyond errors to include ALL agent experiences?
3. How should supermemory management be improved — smarter writes, consolidation, pruning?
4. Should we build a unified memory layer that coordinates all three systems?
5. What's the right balance of complexity vs reliability?
6. How do we handle privacy/forgetting requirements?
7. What retrieval strategy: pure vector, hybrid, or graph-first?

## Scope Boundaries
- INCLUDE: Supermemory management, memory-graph overhaul, learning engine memory integration, retrieval improvements, consolidation, importance scoring
- INCLUDE: Meta-graph / project knowledge graph improvements
- EXCLUDE: Dashboard UI changes (separate task)
- EXCLUDE: External service migrations (stay Bun-native)
- TBD: Whether to introduce vector store dependency
