# JARVIS Security Patterns - Quick Reference

## 5 Core Security Patterns

### 1. Prompt Defense (prompt_defense.py:10-63)
- **What**: Regex-based injection detection + sanitization + risk scoring
- **How**: 9 injection patterns + 4 misalignment patterns + recursive sanitization
- **Threshold**: Risk score 0.5 triggers rejection
- **For OpenCode**: Sanitize user prompts before Claude API calls

### 2. Trust Boundary (trust_boundary.py:10-70)
- **What**: Fail-closed boundary policy with whitelist flow control
- **How**: 4 boundaries + allowed flow matrix + hard-deny paths
- **Boundaries**: opencode_sandbox, vision_runtime, personal_memory, host_os
- **For OpenCode**: Isolate from VISION sensitive components

### 3. Veto System (maat_veto_engine.py:20-73)
- **What**: Cryptographically-signed hard-stop authority
- **How**: Signed veto events + in-memory cache + graduated enforcement
- **Severity**: warning→logged, block→blocked, emergency→terminated
- **For OpenCode**: Emergency stop for security violations

### 4. Capability Tickets (capability_ticket_service.py:88-195)
- **What**: Signed capability tickets with delegation chains
- **How**: Time-bound tickets + 8-point verification + revocation support
- **Constraints**: Max 4-level delegation, bearer-specific, time-bound
- **For OpenCode**: Fine-grained tool authorization

### 5. Channel Security (channel_security.py:13-33)
- **What**: Channel classification with encryption enforcement
- **How**: 4 channel types + encryption whitelist + format isolation
- **Channels**: RED (encrypted), BLACK (encrypted), TOON (obfuscated), CLEAR (plaintext)
- **For OpenCode**: Enforce encryption policies for sensitive data

## Critical Invariants
1. Fail-Closed (default deny)
2. No Override (veto is final)
3. Immutable Audit (CLEAR channel)
4. Signed Events (Ed25519)
5. Bounded Delegation (max 4 levels)
6. Time-Bound Access (expiration)
7. Revocable Tickets (issuer control)
8. Thread-Safe State (mutex protected)

## Implementation Roadmap
- Week 1: Prompt Defense
- Week 2: Trust Boundaries
- Week 3: Capability Tickets
- Week 4: Veto System
- Week 5: Channel Security
