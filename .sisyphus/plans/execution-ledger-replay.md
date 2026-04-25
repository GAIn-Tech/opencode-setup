# Execution Ledger & Deterministic Replay Plan

## TL;DR

**Objective**: Build cryptographically signed, replayable execution traces for every agent action - enabling audit, debugging, and regression testing.

**Core Innovation**: Every agent decision is recorded with full context and signed for integrity. Solve the "why did it do that?" problem.

**Timeline**: 8 weeks (can run parallel with VMG)
**Dependencies**: opencode-cli-v2 bootstrap
**Deliverables**: Trace capture, signing, storage, replay engine

---

## Context

### Why Execution Ledger Matters
Current AI coding tools are **opaque**. When an agent:
- Makes a wrong decision → Can't trace why
- Succeeds → Can't replicate the success pattern
- Creates a bug → No audit trail

**Execution Ledger fixes this** by treating agent actions as verifiable transactions.

### Competitive Advantage
- **Claude Code**: No replay capability
- **Cursor**: No cryptographic verification
- **Codex CLI**: Basic logging, no replay
- **Devin**: Claims autonomy, no audit trail

**We differentiate with provable actions**.

---

## Work Objectives

### Core Objective
Create immutable, signed, replayable execution traces that capture:
- Every decision made
- Every tool invoked
- Every file changed
- Full context at each step

### Concrete Deliverables
1. **Trace Capture**: Hook into agent execution pipeline
2. **Cryptographic Signing**: ed25519 signatures per trace
3. **Storage Layer**: Append-only log with verification
4. **Replay Engine**: Deterministic re-execution
5. **Diff/Compare**: Compare traces across runs
6. **Dashboard**: Visualize execution flow

### Definition of Done
```bash
# Capture works
bun run ledger:capture --task-id=abc123

# Signing works
bun run ledger:verify --trace-id=abc123

# Replay works
bun run ledger:replay --trace-id=abc123 --dry-run

# All tests pass
bun test packages/opencode-ledger
```

### Must Have
- [ ] Trace schema with full context
- [ ] ed25519 signing (every trace)
- [ ] Append-only storage (immutable)
- [ ] Deterministic replay
- [ ] Query/filter capabilities
- [ ] Export/import (portability)

### Must NOT Have
- NO mutable traces (append-only)
- NO plaintext secrets in traces
- NO replay without verification
- NO dependency on external services

---

## Verification Strategy

### Agent-Executed QA Scenarios

**Scenario: Full Capture → Sign → Verify → Replay**
```
Tool: Bun test
Preconditions: Ledger initialized, test task running
Steps:
1. Execute test task with 3 tool calls
2. Capture trace to ledger
3. Sign trace with agent key
4. Verify signature passes
5. Replay trace in dry-run mode
6. Assert same tool calls made
7. Assert same outputs received
Expected: End-to-end capture and replay works
Evidence: test-ledger-e2e.json
```

**Scenario: Tamper Detection**
```
Tool: Bun test
Steps:
1. Capture and sign trace
2. Modify trace file (change one output)
3. Run verification
4. Assert verification fails
5. Assert error message indicates tampering
Expected: Cryptographic integrity enforced
Evidence: test-tamper-detection.json
```

**Scenario: Replay with Different Outcomes**
```
Tool: Bun test
Preconditions: Trace captured, environment changed
Steps:
1. Capture trace of "git status" (returns "clean")
2. Make working directory dirty
3. Replay trace
4. Assert "git status" returns "dirty"
5. Assert trace flagged "outcome diverged"
Expected: Replay detects environmental changes
Evidence: test-replay-divergence.json
```

---

## Architecture

### Trace Schema

```typescript
interface ExecutionTrace {
  // Identity
  traceId: string;          // UUID v4
  parentTraceId?: string;   // For sub-tasks
  taskId: string;           // Reference to task
  
  // Context
  timestamp: Date;
  agentId: string;
  sessionId: string;
  repoPath: string;
  
  // Input
  taskContext: {
    description: string;
    files: string[];
    constraints: string[];
  };
  
  // Plan
  plan: {
    strategy: string;
    estimatedSteps: number;
    dependencies: string[];
  };
  
  // Actions (the ledger)
  actions: Array<{
    actionId: string;
    timestamp: Date;
    tool: string;
    
    // Input
    input: unknown;
    inputHash: string;      // SHA256 of input
    
    // Execution
    durationMs: number;
    
    // Output
    output: unknown;
    outputHash: string;     // SHA256 of output
    exitCode?: number;
    
    // Side effects
    fileDiffs?: FileDiff[];
    networkCalls?: NetworkCall[];
    
    // Result
    result: 'success' | 'failure' | 'timeout';
    error?: string;
    
    // Signature
    signature: string;      // ed25519 of action JSON
  }>;
  
  // Outcome
  outcome: {
    status: 'completed' | 'failed' | 'cancelled';
    summary: string;
    filesChanged: string[];
    testsPassed?: number;
    testsFailed?: number;
  };
  
  // Metadata
  meta: {
    modelUsed: string;
    tokensConsumed: number;
    costEstimate: number;
  };
  
  // Integrity
  merkleRoot: string;       // Merkle tree of actions
  traceSignature: string;   // ed25519 of entire trace
}

interface FileDiff {
  path: string;
  beforeHash: string;
  afterHash: string;
  patch: string;
}
```

### Storage Layer

```
~/.opencode/ledger/
├── traces/
│   ├── 2026/
│   │   ├── 04/
│   │   │   ├── trace-abc123.json.gz
│   │   │   └── trace-def456.json.gz
├── index/
│   ├── by-task-id.json     // taskId -> [traceIds]
│   ├── by-repo.json         // repo -> [traceIds]
│   └── by-date.json         // date -> [traceIds]
└── keys/
    └── agent-ed25519.key    // Private key (encrypted)
```

### Replay Engine

```typescript
interface ReplayEngine {
  // Load and verify
  load(traceId: string): Promise<ExecutionTrace>;
  verify(trace: ExecutionTrace): Promise<boolean>;
  
  // Replay modes
  replay(
    trace: ExecutionTrace,
    mode: 'dry-run' | 'replay' | 'branch'
  ): Promise<ReplayResult>;
  
  // Compare
  diff(
    traceA: ExecutionTrace,
    traceB: ExecutionTrace
  ): Promise<DiffResult>;
  
  // Analytics
  extractPatterns(trace: ExecutionTrace): Promise<Pattern[]>;
}

interface ReplayResult {
  success: boolean;
  divergences: Array<{
    actionIndex: number;
    expected: unknown;
    actual: unknown;
    type: 'output' | 'exitCode' | 'sideEffect';
  }>;
  newTrace?: ExecutionTrace; // For branching
}
```

---

## Execution Strategy

### Wave 1: Core Infrastructure (Weeks 1-2)

**Task 1: Trace Schema & Storage**
- Define TypeScript interfaces
- Implement append-only file storage
- Add compression (gzip)
- Build index maintenance

**Task 2: Hook Integration**
- Intercept tool calls in opencode-cli-v2
- Capture inputs/outputs
- Calculate hashes

### Wave 2: Cryptography (Weeks 3-4)

**Task 3: ed25519 Signing**
- Key generation (per agent)
- Signing on capture
- Verification on load
- Merkle tree for actions

**Task 4: Security Hardening**
- Encrypt private keys
- Redact secrets from traces
- Access control

### Wave 3: Replay Engine (Weeks 5-6)

**Task 5: Replay Implementation**
- Dry-run mode (validate only)
- Replay mode (re-execute)
- Branch mode (replay + new actions)
- Divergence detection

**Task 6: Diff & Compare**
- Trace comparison
- Visual diff of divergences
- Pattern extraction

### Wave 4: Integration & Hardening (Weeks 7-8)

**Task 7: Dashboard Integration**
- Trace browser
- Execution visualization
- Search/filter

**Task 8: Production Hardening**
- Performance optimization
- Backup/restore
- Documentation

---

## TODOs

### Task 1: Trace Schema & Storage
**What to do:**
```typescript
// Define schema
interface ExecutionTrace { ... }

// Implement storage
class LedgerStorage {
  async append(trace: ExecutionTrace): Promise<void>;
  async read(traceId: string): Promise<ExecutionTrace>;
  async query(criteria: Query): Promise<Trace[]>;
}
```

**Acceptance Criteria:**
- [ ] Schema validated
- [ ] Append-only enforced
- [ ] Compression 10:1 ratio
- [ ] Query < 100ms

---

### Task 2: Hook Integration
**What to do:**
- Monkey-patch tool calls in CLI
- Capture before/after
- Store to ledger

**Acceptance Criteria:**
- [ ] Every tool call captured
- [ ] Zero overhead when disabled
- [ ] No impact on execution

---

### Task 3: ed25519 Signing
**What to do:**
```typescript
import { ed25519 } from '@noble/curves/ed25519';

function signTrace(trace: ExecutionTrace, privateKey: Uint8Array): string {
  const message = canonicalJson(trace);
  return ed25519.sign(message, privateKey);
}
```

**Acceptance Criteria:**
- [ ] Signatures < 10ms
- [ ] Verification < 10ms
- [ ] Tamper detection 100%

---

### Task 4: Replay Engine
**What to do:**
```typescript
class ReplayEngine {
  async replay(trace: ExecutionTrace, mode: ReplayMode): Promise<ReplayResult> {
    for (const action of trace.actions) {
      // Re-execute or simulate
      const result = await this.execute(action, mode);
      
      // Check divergence
      if (!this.matches(action.expected, result)) {
        return { diverged: true, at: action };
      }
    }
  }
}
```

**Acceptance Criteria:**
- [ ] Dry-run validates signatures
- [ ] Replay re-executes tools
- [ ] Divergence detected accurately

---

## Integration with VMG

The Execution Ledger and VMG work together:

```
Execution Ledger → VMG
├── Tool outcomes learned as facts
├── Successful patterns added to semantic memory
├── Failures with root causes stored as causal edges
└── Replay validates memory accuracy

VMG → Execution Ledger
├── Prior knowledge informs tool selection
├── Historical patterns guide planning
└── Contradictions trigger new traces
```

---

## Success Criteria

```bash
# Capture works
bun run task --ledger && bun run ledger:list | grep "trace-"

# Signing works
bun run ledger:verify $(bun run ledger:list | tail -1)
# Output: ✓ Signature valid

# Replay works
bun run ledger:replay --trace-id=abc123 --mode=dry-run
# Output: ✓ 15/15 actions verified

# Tamper detection works
sed -i 's/success/failure/' ~/.opencode/ledger/traces/trace-abc123.json
bun run ledger:verify abc123
# Output: ✗ Signature invalid (tampered)
```

---

## Competitive Position

| Feature | Claude | Cursor | Codex | Devin | **OpenCode v3** |
|---------|--------|--------|-------|-------|-----------------|
| Execution capture | ⚠️ Basic | ❌ No | ⚠️ Logs | ❌ No | ✅ Full traces |
| Cryptographic signing | ❌ No | ❌ No | ❌ No | ❌ No | ✅ ed25519 |
| Deterministic replay | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Yes |
| Audit trail | ⚠️ Partial | ❌ No | ⚠️ Basic | ❌ No | ✅ Complete |
| Regression testing | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Replay + diff |

**Position**: "The only AI coding system with provable actions"

---

**Plan Status**: Ready for review
**Next Action**: Approve → Begin Task 1 (Trace Schema)
