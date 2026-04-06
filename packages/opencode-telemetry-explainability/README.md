# opencode-telemetry-explainability

Telemetry and metadata explainability for routing/delegation decisions.

## Overview

This package provides validation, explanation, and provenance tracking for telemetry events in the OpenCode control plane. It ensures that all routing and delegation decisions can be traced back to their authority source.

## Purpose

**Task 6**: Harden telemetry/metadata for routing/delegation explainability

This module ensures:
- Telemetry payloads include minimum required metadata
- Routing decisions can be explained in human-readable form
- Provenance chains are tracked for authority resolution
- Missing metadata is detected and reported

## Installation

```bash
bun add opencode-telemetry-explainability
```

## Usage

### Validate Telemetry Payload

```javascript
import { validateTelemetryPayload } from 'opencode-telemetry-explainability';

const payload = {
  event_type: 'routing',
  model_id: 'gpt-5.2',
  provider: 'openai',
  decision_reason: 'category_match',
  authority_source: 'repo_config',
  timestamp: Date.now()
};

const result = validateTelemetryPayload(payload);
if (!result.valid) {
  console.error('Missing fields:', result.missing);
}
```

### Explain Routing Decision

```javascript
import { explainRoutingDecision } from 'opencode-telemetry-explainability';

const decision = {
  model_id: 'gpt-5.2',
  provider: 'openai',
  decision_reason: 'category_match',
  authority_source: 'repo_config',
  category: 'visual-engineering'
};

const explanation = explainRoutingDecision(decision);
// "Model: gpt-5.2 | Provider: openai | Category: visual-engineering | Reason: category_match | Authority: repo_config"
```

### Format Provenance

```javascript
import { formatProvenance, PROVENANCE_SOURCES } from 'opencode-telemetry-explainability';

const provenance = {
  source: PROVENANCE_SOURCES.REPO_CONFIG,
  file: './opencode-config/oh-my-opencode.json',
  key: 'categories.visual-engineering.model'
};

const formatted = formatProvenance(provenance);
// "From repo_config: ./opencode-config/oh-my-opencode.json → categories.visual-engineering.model"
```

## API

### Constants

#### `METADATA_REQUIREMENTS`

Defines required and recommended fields for each event type:
- `routing`: Model routing decisions
- `delegation`: Agent delegation decisions
- `tool_invocation`: Tool usage events

#### `PROVENANCE_SOURCES`

Authority source types matching the runtime authority precedence chain:
- `ENV_VAR`: Environment variable override
- `HOME_CONFIG`: ~/.config/opencode/*.json
- `REPO_CONFIG`: ./opencode-config/*.json
- `DEFAULT`: Hardcoded default fallback

### Functions

#### `getRequiredMetadataFields(eventType)`

Returns array of required field names for an event type.

#### `validateTelemetryPayload(payload)`

Validates a telemetry payload for completeness.

Returns: `{ valid: boolean, missing: string[], warnings: string[] }`

#### `explainRoutingDecision(decision)`

Generates human-readable explanation for a routing decision.

#### `explainDelegationDecision(decision)`

Generates human-readable explanation for a delegation decision.

#### `formatProvenance(provenance)`

Formats provenance information for display.

## Integration with Runtime Authority

This package works with `opencode-runtime-authority` to ensure telemetry includes proper provenance:

```javascript
import { getEffectiveConfig } from 'opencode-runtime-authority';
import { validateTelemetryPayload, explainRoutingDecision } from 'opencode-telemetry-explainability';

// Resolve model with provenance
const config = getEffectiveConfig('visual-engineering');

// Create telemetry payload
const payload = {
  event_type: 'routing',
  model_id: config.modelId,
  provider: config.provider,
  decision_reason: 'category_resolution',
  authority_source: config.source,
  provenance: config.provenance,
  timestamp: Date.now()
};

// Validate before emitting
const validation = validateTelemetryPayload(payload);
if (!validation.valid) {
  throw new Error(`Incomplete telemetry: ${validation.missing.join(', ')}`);
}

// Generate explanation for logging
console.log(explainRoutingDecision(payload));
```

## Testing

```bash
bun test
```

## Related Packages

- `opencode-runtime-authority`: Single source of truth for agent/category/model resolution
- `opencode-delegation-liveness`: Delegation liveness detection and progress tracking
- `opencode-degraded-mode`: Explicit degraded-mode state and containment
- `opencode-threshold-invariants`: Cross-loop threshold invariants

## Evidence

Test output: `.sisyphus/evidence/ecosystem-plan-tests/task-6-telemetry.txt`
