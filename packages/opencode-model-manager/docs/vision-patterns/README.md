# VISION Architectural Patterns in OpenCode

## Overview

This document describes the implementation of VISION architectural patterns (fail-closed, sandbox isolation, telemetry quality) in OpenCode. These patterns were implemented during Phase 1 to address sparse tool/skill usage and improve system reliability.

## Core Patterns Implemented

### 1. SecurityVeto System (Fail-Closed Pattern)
**Purpose**: Convert advisory recommendations to mandatory enforcement

**Implementation**:
- `SecurityVeto` class in `packages/opencode-validator/src/security-veto.js`
- Integrates with ContextBridge for mandatory compression decisions
- Veto cannot be bypassed when budget thresholds exceed safety limits

**Key Features**:
- Budget thresholds: 75% (WARNING), 80% (CRITICAL), 85% (BLOCK)
- Mandatory compression when >=80% budget consumed
- Blocks work above 85% threshold
- No "veto stripped" bypass mechanism

**Example Usage**:
```javascript
const veto = new SecurityVeto();
const decision = veto.evaluate(contextBudget, sessionId);

if (decision.action === 'block') {
  // Work is blocked until budget is reduced
  throw new Error(`Budget exceeded: ${contextBudget}%`);
}
```

### 2. EnhancedSandbox (Isolation Pattern)
**Purpose**: Enhanced process isolation for security-critical operations

**Implementation**:
- `EnhancedSandbox` class in `packages/opencode-crash-guard/src/enhanced-sandbox.js`
- Provides multiple isolation layers with configurable strictness
- Prevents cross-contamination between processes

**Key Features**:
- Multi-layer isolation (process, memory, filesystem, network)
- Configurable strictness levels (lenient, moderate, strict)
- Automatic cleanup and resource reclamation
- Integration with crash recovery system

**Example Usage**:
```javascript
const sandbox = new EnhancedSandbox({
  isolationLevel: 'strict',
  cleanupTimeout: 5000
});

const result = await sandbox.run(() => {
  // Potentially dangerous operation
  return dangerousFunction();
});
```

### 3. TelemetryQualityGate (Telemetry Quality Pattern)
**Purpose**: Ensure telemetry data integrity and completeness

**Implementation**:
- `TelemetryQualityGate` class in `packages/opencode-model-manager/src/monitoring/telemetry-quality-gate.js`
- Integrated into `MetricsCollector` for real-time quality checking
- Enforces data completeness and format validation

**Key Features**:
- Real-time data validation (schema, completeness, timestamps)
- Automatic quality degradation detection
- Integration with alert system for quality issues
- Historical quality trend analysis

**Example Usage**:
```javascript
const qualityGate = new TelemetryQualityGate();
const telemetryData = {
  event: 'model_inference',
  model: 'gpt-5',
  tokens: 1500,
  timestamp: Date.now()
};

const qualityCheck = qualityGate.validate(telemetryData);
if (!qualityCheck.valid) {
  console.warn('Telemetry quality issue:', qualityCheck.issues);
}
```

## Integration Points

### ContextBridge Integration
The ContextBridge was modified to use mandatory enforcement:

```javascript
// Before (Advisory)
evaluateAndCompress(contextBudget) {
  if (contextBudget >= 0.8) return { action: 'compress_urgent', advisory: true };
  return { action: 'none', advisory: true };
}

// After (Mandatory)
evaluateAndCompress(contextBudget) {
  const veto = new SecurityVeto();
  const decision = veto.evaluate(contextBudget, 'current-session');
  
  if (decision.action === 'block') {
    return { action: 'block', mandatory: true };
  } else if (decision.action === 'compress') {
    return { action: 'compress', mandatory: true };
  }
  return { action: 'none', mandatory: false };
}
```

### Metrics Collector Integration
TelemetryQualityGate integrated into metrics collection pipeline:

```javascript
class MetricsCollector {
  constructor() {
    this.qualityGate = new TelemetryQualityGate();
  }
  
  recordEvent(event) {
    // Validate telemetry quality before recording
    const qualityCheck = this.qualityGate.validate(event);
    if (!qualityCheck.valid) {
      this.handleQualityIssue(qualityCheck.issues);
    }
    
    // Record validated event
    this.db.prepare('INSERT INTO metrics...').run(event);
  }
}
```

## Test Results

All Phase 1 patterns have been validated:

| Test Category | Tests | Status |
|---------------|-------|--------|
| Model Manager Tests | 360/360 | ✅ PASS |
| ContextBridge Component Tests | 21/21 | ✅ PASS |
| Integration Layer Tests | 123/123 | ✅ PASS |
| AlertManager Tests | 35/35 | ✅ PASS |
| StateMachine Tests | 7/7 | ✅ PASS |
| CacheLayer Tests | ✓ | ✅ PASS |

## Configuration

### Security Thresholds
```json
{
  "security_veto": {
    "warning_threshold": 75,
    "critical_threshold": 80,
    "block_threshold": 85,
    "mandatory_enforcement": true
  },
  "sandbox": {
    "default_isolation": "moderate",
    "cleanup_timeout_ms": 5000,
    "resource_limits": {
      "memory_mb": 512,
      "cpu_percent": 50
    }
  },
  "telemetry_quality": {
    "validation_enabled": true,
    "required_fields": ["event", "timestamp", "session_id"],
    "quality_threshold": 0.95
  }
}
```

## Usage Examples

See the `examples/` directory for:
1. SecurityVeto usage in production workflows
2. EnhancedSandbox for isolated code execution
3. TelemetryQualityGate integration examples
4. End-to-end workflow with all patterns

## Phase 2 Planning

Next phase focuses on:
1. **Enhanced Monitoring**: Real-time visualization of veto decisions
2. **Analytics Integration**: ML-based pattern detection
3. **Adaptive Thresholds**: Dynamic threshold adjustment based on workload
4. **Cross-System Integration**: Extend patterns to all OpenCode packages

## Migration Guide

For existing code using advisory patterns:

1. **Replace Advisory Checks**: Update `if (budget > 0.8)` to use SecurityVeto
2. **Add Sandbox Wrapping**: Wrap unsafe operations with EnhancedSandbox
3. **Integrate Quality Gates**: Add TelemetryQualityGate to metrics collection
4. **Update Tests**: Test expectations for mandatory enforcement

See `MIGRATION.md` for detailed migration steps.