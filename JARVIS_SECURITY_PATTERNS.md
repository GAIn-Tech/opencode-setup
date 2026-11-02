# JARVIS Security Patterns Analysis for OpenCode Integration

**Analysis Date**: Feb 18, 2026  
**Source**: JARVIS/src/security/ (5 modules)  
**Purpose**: Extract security patterns for opencode-setup integration

---

## 1. PROMPT DEFENSE MECHANISMS

**File**: `/c/Users/jack/work/JARVIS/src/security/prompt_defense.py`

### Pattern Overview
Multi-layer defense against prompt injection and misalignment attacks using regex pattern detection, payload sanitization, and risk scoring.

### Key Components

#### Injection Pattern Detection (Lines 10-20)
```
9 injection vectors detected:
- "ignore previous instructions"
- "reveal system prompt"
- "developer message"
- "jailbreak"
- "BEGIN/END SYSTEM"
- "exfiltrat[e]"
- "bypass policy"
- "tool: shell"
```

**Mechanism**: Case-insensitive regex matching on flattened payload text

#### Misalignment Pattern Detection (Lines 22-27)
```
4 behavioral risk patterns:
- "delete all"
- "disable security"
- "send secrets"
- "override veto"
```

**Mechanism**: Detects dangerous requests beyond injection attempts

#### Sanitization Strategy (Lines 29-38)
```python
def sanitize(self, payload: Any) -> Any:
    # Recursive sanitization for nested structures
    # Remove null bytes: \x00
    # Remove control chars: \x01-\x08, \x0b, \x0c, \x0e-\x1f
    # Enforce 8000-char limit per string
```

**Defense Depth**: Handles dicts, lists, strings recursively

#### Risk Scoring (Lines 54-63)
```python
def misalignment_score(self, message: dict) -> float:
    # Count pattern hits
    # Normalize: min(1.0, hits / 4.0)
    # Threshold: 0.5 triggers rejection
```

**Graduated Response**: 0.0-0.5 (pass), 0.5+ (reject)

### Integration Pattern for OpenCode
```
1. Sanitize user prompts before sending to Claude
2. Validate instruction boundaries
3. Score misalignment risk
4. Reject if score >= 0.5
5. Log all violations to audit trail
```

---

## 2. TRUST BOUNDARY ENFORCEMENT

**File**: `/c/Users/jack/work/JARVIS/src/security/trust_boundary.py`

### Pattern Overview
Fail-closed boundary policy enforcement using explicit boundary definitions, whitelist-based flow control, and immutable audit logging.

### Key Components

#### Boundary Definitions (Lines 10-13)
```
4 trust boundaries:
- BOUNDARY_OPENCODE = "opencode_sandbox"
- BOUNDARY_VISION_RUNTIME = "vision_runtime"
- BOUNDARY_PERSONAL_MEMORY = "vision_personal_memory"
- BOUNDARY_HOST_OS = "host_os"
```

**Design**: Explicit naming enables clear policy definition

#### Allowed Flow Matrix (Lines 15-21)
```
Whitelist-based flows (deny-by-default):
- opencode → vision_runtime: {tool_result}
- vision_runtime → opencode: {tool_request}
- vision_runtime → personal_memory: {none}
- vision_runtime → host_os: {container_api}
```

**Enforcement**: Only listed (source, target, operation) tuples allowed

#### Hard-Deny Paths (Lines 23-28)
```python
# Non-negotiable boundaries:
if source == BOUNDARY_OPENCODE and target == BOUNDARY_PERSONAL_MEMORY:
    return DENY("OpenCode cannot access personal memory")
if source == BOUNDARY_OPENCODE and target == BOUNDARY_HOST_OS:
    return DENY("OpenCode cannot control host OS")
```

**Invariant**: No escape hatch for critical boundaries

#### Audit Logging (Lines 60-70)
```python
def _deny(self, source, target, operation, reason):
    self._audit.log(
        EventType.CHANNEL_VIOLATION,
        "trust-boundary",
        {"source": source, "target": target, "operation": operation, "reason": reason},
        channel="CLEAR",
    )
```

**Immutability**: All violations logged to CLEAR channel (plaintext audit trail)

### Integration Pattern for OpenCode
```
1. Define boundaries: opencode_sandbox, vision_runtime, etc.
2. Create whitelist of allowed flows
3. Enforce hard-deny paths for sensitive resources
4. Log all boundary violations
5. Fail closed on unknown flows
```

---

## 3. VETO SYSTEM (Ma'at Veto Engine)

**File**: `/c/Users/jack/work/JARVIS/src/security/maat_veto_engine.py`

### Pattern Overview
Cryptographically-signed hard-stop authority with no override pathway. Issues immutable veto events and maintains in-memory veto cache for fast path checks.

### Key Components

#### Design Invariant (Line 8)
```
"Issues signed veto events and blocks violating paths.
Design invariant: no override pathway exists."
```

**Philosophy**: Veto is final and irreversible

#### Veto Event Structure (Lines 20-45)
```python
event = {
    "veto_id": str(uuid.uuid4()),
    "timestamp": datetime.now(timezone.utc).isoformat(),
    "authority": authority,  # Who issued veto
    "target": {
        "target_id": target_id,
        "target_type": target_type,
    },
    "reason": {
        "category": category,
        "description": description,
        "severity": severity,
    },
    "action_taken": self._action_for_severity(severity),
    "affected_agents": affected_agents,
    "signature": {
        "algorithm": "Ed25519",
        "public_key": "",
        "signature": "",
    },
}
```

**Immutability**: Signed with Ed25519, full context preserved

#### Severity-Based Actions (Lines 67-73)
```python
@staticmethod
def _action_for_severity(severity: str) -> str:
    if severity == "warning": return "logged"
    if severity == "block": return "blocked"
    if severity == "emergency": return "terminated"
    return "escalated"
```

**Graduated Enforcement**: warning → block → emergency → termination

#### Blocked Target Tracking (Lines 46-48)
```python
if severity in {"block", "emergency"}:
    self._blocked_targets.add(target_id)
```

**Performance**: In-memory set for O(1) veto lookups

#### Veto Verification (Lines 50-53)
```python
def check_allowed(self, target_id: str) -> tuple[bool, str]:
    if target_id in self._blocked_targets:
        return False, "blocked by Ma'at veto"
    return True, "ok"
```

**Fast Path**: Single set membership check

### Integration Pattern for OpenCode
```
1. Create MaatVetoEngine instance with validator and audit log
2. Issue veto on security violations: issue_veto(authority, target_id, ...)
3. Check before every sensitive operation: check_allowed(target_id)
4. Severity levels: warning (log), block (deny), emergency (terminate)
5. Veto events are signed and immutable
```

---

## 4. CAPABILITY MANAGEMENT

**File**: `/c/Users/jack/work/JARVIS/src/security/capability_ticket_service.py`

### Pattern Overview
Signed capability tickets with delegation chains, time bounds, revocation support, and 8-point verification before access. Fail-closed authorization with persistent state management.

### Key Components

#### Fail-Closed Authorization (Lines 1-3)
```
"Phase 2 (P2-C1): fail-closed authorization checks before access."
```

**Default**: Deny all access unless explicitly granted by valid ticket

#### Ticket Structure (Lines 95-115)
```python
ticket = {
    "ticket_id": str(uuid.uuid4()),
    "issued_at": issued_at.isoformat(),
    "expires_at": expires_at.isoformat(),
    "issuer": issuer,  # Who issued
    "bearer": bearer,  # Who can use
    "capabilities": capabilities,  # What actions allowed
    "delegation_chain": chain,  # Delegation history
    "revocable": revocable,  # Can be revoked
    "signature": {
        "algorithm": "Ed25519",
        "public_key": "",
        "signature": "",
    },
}
```

**Binding**: Ticket bound to specific bearer, issuer, and capabilities

#### Delegation Chain Constraints (Lines 88-89)
```python
chain = list(delegation_chain or [])
if len(chain) > 4:
    raise ValueError("delegation chain exceeds max depth")
```

**Limit**: Max 4-level delegation prevents privilege escalation chains

#### Persistent State Management (Lines 50-75)
```python
def _init_sqlite(self) -> None:
    # WAL mode: Write-Ahead Logging for concurrent access
    # PRAGMA synchronous=FULL: Durability guarantee
    # Two tables:
    #   - capability_tickets (ticket_id, payload, updated_at)
    #   - revoked_tickets (ticket_id, revoked_at)
```

**Durability**: SQLite with WAL ensures atomic state persistence

#### Verification Checklist (Lines 155-195)
```
8-point verification before granting access:
1. Schema validation (structure check)
2. Signature verification (Ed25519)
3. 
