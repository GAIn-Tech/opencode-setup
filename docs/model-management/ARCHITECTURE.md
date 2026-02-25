# Model Management System Architecture

## Overview

The OpenCode Model Management System is an automated pipeline that discovers, validates, assesses, and integrates AI models from 6 providers (OpenAI, Anthropic, Google, Groq, Cerebras, NVIDIA) with minimal human intervention while maintaining safety and reliability.

**Key Capabilities:**
- Automated model discovery from multiple providers
- Two-tier caching for performance
- Change detection and diff analysis
- Real benchmark-based assessment
- 5-state lifecycle management
- Risk-based auto-approval
- Automated PR generation
- Complete audit trail

## System Architecture

```mermaid
graph TB
    subgraph "Provider Layer"
        P1[OpenAI API]
        P2[Anthropic API]
        P3[Google API]
        P4[Groq API]
        P5[Cerebras API]
        P6[NVIDIA API]
    end
    
    subgraph "Adapter Layer"
        A1[OpenAI Adapter]
        A2[Anthropic Adapter]
        A3[Google Adapter]
        A4[Groq Adapter]
        A5[Cerebras Adapter]
        A6[NVIDIA Adapter]
    end
    
    subgraph "Discovery & Caching"
        DE[Discovery Engine]
        CB[Circuit Breaker]
        CL[Cache Layer]
        L1[L1 Cache<br/>5min TTL]
        L2[L2 Cache<br/>1hr TTL]
    end
    
    subgraph "Change Detection"
        SS[Snapshot Store]
        DIFF[Diff Engine]
        CE[Change Events]
    end
    
    subgraph "Assessment"
        MA[Model Assessor]
        MC[Metrics Collector]
        HE[HumanEval]
        MBPP[MBPP]
        LAT[Latency Tests]
    end
    
    subgraph "Lifecycle Management"
        SM[State Machine]
        AL[Audit Logger]
        AR[Auto-Approval Rules]
    end
    
    subgraph "Automation"
        PRG[PR Generator]
        CV[Catalog Validator]
        CI[GitHub Actions CI]
    end
    
    subgraph "Monitoring"
        PMC[Pipeline Metrics]
        AM[Alert Manager]
        API[Monitoring API]
    end
    
    P1 --> A1
    P2 --> A2
    P3 --> A3
    P4 --> A4
    P5 --> A5
    P6 --> A6
    
    A1 & A2 & A3 & A4 & A5 & A6 --> DE
    DE --> CB
    CB --> CL
    CL --> L1
    CL --> L2
    
    CL --> SS
    SS --> DIFF
    DIFF --> CE
    
    CE --> MA
    MA --> HE & MBPP & LAT
    MA --> MC
    
    MC --> SM
    SM --> AL
    SM --> AR
    
    AR --> PRG
    PRG --> CV
    CV --> CI
    
    DE --> PMC
    CL --> PMC
    SM --> PMC
    PRG --> PMC
    PMC --> AM
    AM --> API
```

## Component Diagram

```mermaid
graph LR
    subgraph "Core Components"
        BA[Base Adapter]
        DE[Discovery Engine]
        CL[Cache Layer]
        SS[Snapshot Store]
        DIFF[Diff Engine]
        SM[State Machine]
    end
    
    subgraph "Support Components"
        CB[Circuit Breaker]
        AL[Audit Logger]
        AR[Auto-Approval]
        MA[Model Assessor]
        MC[Metrics Collector]
    end
    
    subgraph "Automation"
        PRG[PR Generator]
        CV[Catalog Validator]
    end
    
    subgraph "Monitoring"
        PMC[Pipeline Metrics]
        AM[Alert Manager]
    end
    
    BA -.implements.-> DE
    DE --> CB
    DE --> CL
    CL --> SS
    SS --> DIFF
    DIFF --> MA
    MA --> MC
    MC --> SM
    SM --> AL
    SM --> AR
    AR --> PRG
    PRG --> CV
    
    DE --> PMC
    CL --> PMC
    SM --> PMC
    PMC --> AM
```

## Data Flow

```mermaid
sequenceDiagram
    participant CI as GitHub Actions
    participant DE as Discovery Engine
    participant Cache as Cache Layer
    participant SS as Snapshot Store
    participant DIFF as Diff Engine
    participant MA as Model Assessor
    participant SM as State Machine
    participant AR as Auto-Approval
    participant PRG as PR Generator
    
    CI->>DE: Trigger discovery
    DE->>Cache: Check cache
    alt Cache hit
        Cache-->>DE: Return cached data
    else Cache miss
        DE->>Provider: Fetch models
        Provider-->>DE: Raw model data
        DE->>Cache: Store in cache
    end
    
    DE->>SS: Save snapshot
    SS->>DIFF: Compare with previous
    DIFF-->>DE: Change report
    
    alt Changes detected
        DE->>MA: Assess new models
        MA->>MA: Run benchmarks
        MA-->>SM: Assessment results
        
        SM->>SM: Transition: detected → assessed
        SM->>AR: Evaluate risk
        
        alt Low risk (0-50)
            AR-->>SM: Auto-approve
            SM->>SM: Transition: assessed → approved
        else Medium risk (50-80)
            AR-->>SM: Manual review required
        else High risk (>80)
            AR-->>SM: Block
        end
        
        SM->>PRG: Generate PR
        PRG->>CI: Create pull request
    end
```

## Technology Stack

### Core Technologies
- **Runtime**: Node.js (ESM + CJS modules)
- **Test Framework**: Bun test
- **Database**: SQLite (better-sqlite3)
- **CI/CD**: GitHub Actions
- **API**: Next.js API routes

### Storage Strategy

| Data Type | Storage | Retention | Rationale |
|-----------|---------|-----------|-----------|
| Snapshots | JSON files | 30 days | Simple, portable, version-controllable |
| Audit logs | SQLite | 1 year | Queryable, tamper-evident hash chain |
| Assessments | SQLite | Permanent | Historical quality metrics |
| Monitoring | In-memory | 24 hours | Ephemeral, high-performance |
| Cache L1 | In-memory | 5 minutes | Ultra-fast access |
| Cache L2 | JSON files | 1 hour | Persistent across restarts |

### Provider Integration

| Provider | API Endpoint | Auth Method | Pagination |
|----------|--------------|-------------|------------|
| OpenAI | `/v1/models` | Bearer token | None (single page) |
| Anthropic | `/v1/models` | x-api-key header | Cursor-based (after_id) |
| Google | `/v1beta/models` | Query param (?key=) | None (single page) |
| Groq | `/openai/v1/models` | Bearer token | None (single page) |
| Cerebras | `/v1/models` | Bearer token | None (single page) |
| NVIDIA | `/v1/models` | Bearer token | None (single page) |

## Lifecycle States

```mermaid
stateDiagram-v2
    [*] --> detected: Discovery finds new model
    detected --> assessed: Benchmarks complete
    assessed --> approved: Auto-approval or manual
    approved --> selectable: Added to catalog
    selectable --> default: Promoted by admin
    
    assessed --> detected: Assessment fails
    approved --> assessed: Approval revoked
    selectable --> approved: Removed from catalog
    default --> selectable: Demoted
    
    note right of detected
        Model discovered
        Awaiting assessment
    end note
    
    note right of assessed
        Benchmarks complete
        Metrics collected
    end note
    
    note right of approved
        Human/auto-approved
        Ready for catalog
    end note
    
    note right of selectable
        Appears in UI
        Users can select
    end note
    
    note right of default
        Default for intent
        or category
    end note
```

## Risk Scoring

```mermaid
graph TD
    START[Change Detected] --> EVAL{Evaluate Change}
    
    EVAL -->|Metadata only| LOW[Score: 5]
    EVAL -->|Patch version| LOW2[Score: 10]
    EVAL -->|Minor version| MED[Score: 30]
    EVAL -->|Major version| HIGH[Score: 60]
    EVAL -->|New model| HIGH2[Score: 50]
    EVAL -->|Deprecation| CRIT[Score: 90]
    EVAL -->|Removal| CRIT2[Score: 100]
    
    LOW & LOW2 --> AUTO{Score ≤ 50?}
    MED --> AUTO
    HIGH & HIGH2 --> AUTO
    CRIT & CRIT2 --> AUTO
    
    AUTO -->|Yes| APPROVE[Auto-Approve]
    AUTO -->|50 < score ≤ 80| MANUAL[Manual Review]
    AUTO -->|score > 80| BLOCK[Block]
    
    APPROVE --> PR[Create PR]
    MANUAL --> QUEUE[Review Queue]
    BLOCK --> REJECT[Reject Change]
```

## Caching Strategy

```mermaid
graph TD
    REQ[Request] --> L1{L1 Cache Hit?}
    
    L1 -->|Yes, Fresh| RETURN1[Return Immediately]
    L1 -->|Yes, Stale| STALE[Return Stale Data]
    L1 -->|No| L2{L2 Cache Hit?}
    
    STALE --> BG[Background Refresh]
    BG --> PROVIDER[Fetch from Provider]
    PROVIDER --> UPDATE1[Update L1 & L2]
    
    L2 -->|Yes, Fresh| UPDATE2[Update L1]
    L2 -->|Yes, Stale| STALE2[Return Stale Data]
    L2 -->|No| PROVIDER
    
    UPDATE2 --> RETURN2[Return Data]
    STALE2 --> BG
    PROVIDER --> UPDATE3[Update L1 & L2]
    UPDATE3 --> RETURN3[Return Data]
```

## Monitoring Architecture

```mermaid
graph TB
    subgraph "Instrumentation Points"
        I1[Discovery Calls]
        I2[Cache Access]
        I3[State Transitions]
        I4[PR Creation]
    end
    
    subgraph "Metrics Collection"
        PMC[Pipeline Metrics Collector]
        M1[Discovery Rates]
        M2[Cache Hit/Miss]
        M3[Transition Counts]
        M4[PR Success/Fail]
        M5[Time to Approval]
        M6[Catalog Freshness]
    end
    
    subgraph "Alert Evaluation"
        AM[Alert Manager]
        T1[Provider Failures > 3]
        T2[Stale Catalog > 24h]
        T3[Failed PRs > 2]
    end
    
    subgraph "Exposure"
        API[Monitoring API]
        JSON[JSON Format]
        PROM[Prometheus Format]
    end
    
    I1 & I2 & I3 & I4 --> PMC
    PMC --> M1 & M2 & M3 & M4 & M5 & M6
    M1 & M2 & M3 & M4 & M5 & M6 --> AM
    AM --> T1 & T2 & T3
    AM --> API
    API --> JSON & PROM
```

## Security Model

### Authentication
- Provider API keys stored in GitHub Secrets
- No keys in code or configuration files
- Rotation handled externally

### Audit Trail
- Every state transition logged
- Hash chain prevents tampering
- Includes: timestamp, actor, reason, diff hash
- 1-year retention

### Approval Gates
- No automatic promotion to `default` state
- High-risk changes (score > 80) blocked
- Manual review required for medium-risk (50-80)
- Complete audit trail for all approvals

### Validation Pipeline
- Schema validation
- Duplicate detection
- Forbidden pattern checks
- Required field verification
- Timestamp validation

## Performance Characteristics

| Operation | Target | Actual | Notes |
|-----------|--------|--------|-------|
| Discovery (all providers) | < 10s | ~8s | Parallel execution |
| L1 Cache Hit | < 1ms | < 1ms | In-memory |
| L2 Cache Hit | < 10ms | ~5ms | JSON file read |
| Assessment (per model) | < 5min | ~3min | Real benchmarks |
| Diff Accuracy | > 95% | 100% | Classification accuracy |
| Rollback Time | < 5min | ~10s | File restore + validation |

## Scalability Considerations

### Current Limits
- 6 providers (hardcoded)
- ~50 models per provider
- 30-day snapshot retention
- 1-year audit retention
- 24-hour monitoring retention

### Future Scaling
- Provider registry for dynamic addition
- Sharded snapshot storage
- Distributed caching
- Streaming assessment results
- Real-time monitoring dashboards

## Deployment Architecture

```mermaid
graph TB
    subgraph "GitHub"
        REPO[Repository]
        ACTIONS[GitHub Actions]
        SECRETS[Secrets Store]
    end
    
    subgraph "CI Environment"
        RUNNER[Actions Runner]
        DISCOVERY[Discovery Job]
        VALIDATION[Validation Job]
        PR[PR Creation]
    end
    
    subgraph "Storage"
        CATALOG[catalog-2026.json]
        SNAPSHOTS[.snapshots/]
        AUDIT[audit.db]
        ASSESS[assessments.db]
    end
    
    subgraph "Dashboard"
        NEXT[Next.js App]
        API_ROUTES[API Routes]
        UI[React UI]
    end
    
    REPO --> ACTIONS
    ACTIONS --> RUNNER
    SECRETS --> RUNNER
    
    RUNNER --> DISCOVERY
    DISCOVERY --> VALIDATION
    VALIDATION --> PR
    
    DISCOVERY --> CATALOG
    DISCOVERY --> SNAPSHOTS
    DISCOVERY --> AUDIT
    DISCOVERY --> ASSESS
    
    CATALOG --> NEXT
    AUDIT --> API_ROUTES
    ASSESS --> API_ROUTES
    API_ROUTES --> UI
```

## References

- [README](../../packages/opencode-model-manager/README.md) - Quick start and usage
- [API Reference](./API-REFERENCE.md) - Detailed API documentation
- [Operations Guide](./OPERATIONS.md) - Operational procedures
- [Troubleshooting](./TROUBLESHOOTING.md) - Common issues and solutions
- [Implementation Summary](../../.sisyphus/MODEL-MANAGEMENT-SUMMARY.md) - Complete implementation details
