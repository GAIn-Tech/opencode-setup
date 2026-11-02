# opencode-cross-loop-integration

Cross-loop integration tests for control-plane coherence.

## Overview

This package provides integration test scenarios covering critical outage and drift scenarios across the OpenCode control plane. It ensures coherence across authority resolution, degraded-mode state, threshold semantics, and liveness classification.

## Purpose

**Task 7**: Add cross-loop integration snapshots and outage-path regression coverage

This module ensures:
- Provider outages are handled explicitly with coherent fallback
- ENOENT spawn paths are contained and observable (Bun v1.3.x crash risk)
- Config corruption is detected before runtime
- Concurrent sessions are isolated and tracked independently

## Installation

```bash
bun add opencode-cross-loop-integration
```

## Integration Scenarios

### PROVIDER_OUTAGE

Simulates provider API unavailability or rate limiting.

**Assertions:**
- Authority snapshot remains deterministic
- Degraded-mode state is emitted
- Router, context bridge, and alerting agree on severity
- Liveness classification is appropriate

### ENOENT_SPAWN

Simulates spawn failures due to missing binaries (Bun v1.3.x crash risk).

**Assertions:**
- System does not silently continue
- Failure is explicitly classified
- Containment is observable

### CONFIG_CORRUPTION

Simulates partial or total config file corruption.

**Assertions:**
- Corruption is detected at governance check
- Fallback is explicit
- Recovery is attempted

### CONCURRENT_SESSIONS

Simulates multiple sessions running concurrently.

**Assertions:**
- Sessions are isolated (no cross-contamination)
- Budget is tracked per session
- Liveness is tracked per session

## Usage

### Simulate Provider Outage

```javascript
import { simulateProviderOutage, assertAuthorityCoherence } from 'opencode-cross-loop-integration';

const result = simulateProviderOutage({
  provider: 'openai',
  modelId: 'gpt-5.2',
  duration: 60000
});

const coherence = assertAuthorityCoherence(result);
console.log(coherence);
// { valid: true, source: 'fallback', fallback: { ... }, explicit: true }
```

### Simulate ENOENT Spawn

```javascript
import { simulateENOENTSpawn } from 'opencode-cross-loop-integration';

const result = simulateENOENTSpawn({
  command: 'nonexistent-binary',
  args: ['--flag'],
  category: 'deep'
});

console.log(result.contained); // true
console.log(result.classification.type); // 'enoent'
```

### Simulate Config Corruption

```javascript
import { simulateConfigCorruption } from 'opencode-cross-loop-integration';

const result = simulateConfigCorruption({
  file: './opencode-config/oh-my-opencode.json',
  corruptionType: 'partial',
  affectedKeys: ['agents.atlas.model']
});

console.log(result.detected); // true
console.log(result.detectedAt); // 'governance_check'
```

### Simulate Concurrent Sessions

```javascript
import { simulateConcurrentSessions } from 'opencode-cross-loop-integration';

const result = simulateConcurrentSessions({
  sessionCount: 5,
  categories: ['deep', 'quick', 'visual-engineering'],
  duration: 300000
});

console.log(result.isolation.valid); // true
console.log(result.budgetTracking.perSession); // true
```

## API

### Constants

#### `INTEGRATION_SCENARIOS`

Defines the four integration scenarios:
- `PROVIDER_OUTAGE`
- `ENOENT_SPAWN`
- `CONFIG_CORRUPTION`
- `CONCURRENT_SESSIONS`

### Simulation Functions

#### `simulateProviderOutage(options)`

Simulates a provider outage scenario.

#### `simulateENOENTSpawn(options)`

Simulates an ENOENT spawn failure.

#### `simulateConfigCorruption(options)`

Simulates config file corruption.

#### `simulateConcurrentSessions(options)`

Simulates concurrent session pressure.

### Assertion Functions

#### `assertAuthorityCoherence(result)`

Asserts authority snapshot coherence.

#### `assertDegradedModeVisibility(result)`

Asserts degraded mode is visible.

#### `assertThresholdAgreement(result)`

Asserts threshold semantics agree across loops.

#### `assertLivenessClassification(result)`

Asserts liveness classification is appropriate.

## Testing

```bash
bun test
```

## Related Packages

- `opencode-runtime-authority`: Authority resolution
- `opencode-degraded-mode`: Degraded-mode state
- `opencode-threshold-invariants`: Threshold semantics
- `opencode-delegation-liveness`: Liveness classification
- `opencode-telemetry-explainability`: Telemetry validation

## Evidence

Test output: `.sisyphus/evidence/ecosystem-plan-tests/task-7-provider-outage.txt`
