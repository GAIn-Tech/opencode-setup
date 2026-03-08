# OpenCode Dashboard API Documentation

Complete API reference for all 31 endpoints in the OpenCode Dashboard (`packages/opencode-dashboard`).

## Base URL

```
http://localhost:3000/api
```

## Authentication

Write endpoints require a `X-Opencode-Write-Token` header or `OPENCODE_DASHBOARD_WRITE_TOKEN` env var.
Read endpoints marked **auth required** require a session cookie or `Authorization: Bearer <token>` header.

## Rate Limiting

Write endpoints are rate-limited per IP:

- **Write operations**: 10 requests / 60 seconds
- **Read operations**: unlimited (server-side cache applies where noted)

Rate limit response:
```json
{ "error": "Too many requests" }
```
Status: `429`

## Caching

`GET /api/orchestration` caches responses for 15 seconds. Bypass with `?noCache=1`.

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Short description",
  "message": "Detailed explanation (write routes only)"
}
```

**Common Status Codes:**
| Code | Meaning |
|------|---------|
| 400 | Bad Request — missing/invalid parameters |
| 401 | Unauthorized — missing or invalid token |
| 403 | Forbidden — insufficient permissions |
| 404 | Not Found |
| 409 | Conflict — optimistic concurrency violation |
| 429 | Rate Limited |
| 500 | Internal Server Error |

---

## Endpoints

### Health

#### GET /api/health

Comprehensive system health check. Returns package inventory, model catalog status, recent health log entries, and session token budgets.

**Response:**
```json
{
  "status": "healthy",
  "packages": [
    {
      "name": "opencode-model-manager",
      "version": "1.0.0",
      "hasPackageJson": true,
      "description": "Model lifecycle management"
    }
  ],
  "modelCatalog": {
    "status": "healthy",
    "schemaPresent": true,
    "policiesPresent": true,
    "schemaLastUpdated": "2026-02-01",
    "modelCount": 12,
    "issues": []
  },
  "healthLog": [
    {
      "timestamp": "2026-02-26T12:00:00Z",
      "level": "info",
      "message": "Health check passed"
    }
  ],
  "budgets": {
    "session-abc123": { "used": 45000, "limit": 200000 }
  },
  "stats": {
    "totalPackages": 35,
    "packagesWithJson": 35,
    "errorCount": 0,
    "warnCount": 0,
    "modelCatalogIssues": 0
  }
}
```

**`status` values:** `healthy` | `degraded` | `critical`

---

### Events (SSE)

#### GET /api/events

Server-Sent Events stream for real-time file change notifications. Starts a file watcher on first connection. Sends heartbeats every 30 seconds.

**Response headers:**
```
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

**Event types:**

*Connection established:*
```
data: {"type":"connected","timestamp":1709740800000,"watchPaths":["/path/to/watch"]}
```

*File change:*
```
data: {"type":"change","path":"/path/to/file","event":"modify","timestamp":1709740801234}
```

*Heartbeat (every 30s):*
```
data: {"type":"heartbeat","timestamp":1709740830000}
```

**Usage:**
```javascript
const evtSource = new EventSource('/api/events');
evtSource.onmessage = (e) => {
  const event = JSON.parse(e.data);
  if (event.type === 'change') { /* refresh data */ }
};
```

---

### Config

#### GET /api/config

**Auth required** (`audit:read`)

Returns all configuration files. Secrets are automatically redacted.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `view` | `string` | `effective` — return only merged effective central config |

**Response (default):**
```json
{
  "projectConfig":        { "path": "...", "data": {} },
  "userConfig":           { "path": "...", "data": {} },
  "ohMyConfig":           { "path": "...", "data": {} },
  "compoundConfig":       { "path": "...", "data": {} },
  "rateLimitFallback":    { "path": "...", "data": {} },
  "modelPolicies":        { "path": "...", "data": {} },
  "antigravity":          { "path": "...", "data": {} },
  "opencodeRegistry":     { "path": "...", "data": {} },
  "supermemory":          { "path": "...", "data": {} },
  "deploymentState":      { "path": "...", "data": {} },
  "learningUpdatePolicy": { "path": "...", "data": {} },
  "sessionBudgets":       { "path": "...", "data": {} },
  "centralConfig":        { "path": "...", "data": {} },
  "centralConfigEffective": { "data": {} }
}
```

**Response (`?view=effective`):**
```json
{
  "centralConfigEffective": {
    "data": { "models": [], "rl": {} }
  }
}
```

---

#### POST /api/config

**Auth required** (`config:write`) · **Rate limited** (10/60s)

Atomically write a configuration file. For `centralConfig`, validates JSON schema and enforces optimistic concurrency via `config_version`.

**Request Body:**
```json
{
  "configKey": "centralConfig",
  "data": { "models": [] },
  "config_version": 5
}
```

**`configKey` values:** `projectConfig`, `userConfig`, `ohMyConfig`, `compoundConfig`, `rateLimitFallback`, `modelPolicies`, `antigravity`, `supermemory`, `deploymentState`, `learningUpdatePolicy`, `sessionBudgets`, `centralConfig`

**Response:**
```json
{
  "success": true,
  "path": "/path/to/config.json",
  "config_version": 6
}
```

**Error (409 — stale version):**
```json
{ "error": "Stale config version", "expected": 4, "current": 5 }
```

---

### Docs

#### GET /api/docs

Browse or read markdown documentation files from the repository.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `file` | `string` | Absolute path — returns raw file content |

**Response (index):**
```json
{
  "docs": [
    { "name": "README.md", "path": "/abs/path/README.md", "category": "Root" }
  ]
}
```

**Categories:** `Root`, `Docs`, `Plans`, `Architecture`, `Packages`, `Plugins`, `MCP Servers`, `Templates`, `User`

**Response (`?file=/abs/path/file.md`):**
```json
{ "content": "# File content..." }
```

---

### Frontier Status

#### GET /api/frontier-status

Reads frontier verification and security audit reports from `reports/` directory.

**Response:**
```json
{
  "generated_at": "2026-02-26T12:00:00Z",
  "overall": "pass",
  "frontier": {
    "status": "pass",
    "summary": { "total": 50, "passed": 50, "failed": 0 },
    "source": "/path/reports/frontier/frontier-verify-all.json",
    "generated_at": "2026-02-25T10:00:00Z"
  },
  "security": {
    "status": "pass",
    "summary": {
      "ok": true,
      "semgrep_high": 0,
      "secret_findings": 0,
      "advisory": false,
      "report_id": "abc123",
      "signature": "present"
    },
    "source": "/path/reports/security/security-audit-free.json",
    "generated_at": "2026-02-25T10:00:00Z"
  }
}
```

**`overall`/`status` values:** `pass` | `fail` | `unknown`

---

### Learning

#### GET /api/learning

Get learning engine statistics.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sinceDays` | `integer` | `30` | History window in days (1–365) |

**Response:**
```json
{
  "patterns": { "total": 150, "active": 45, "core": 12 },
  "decay": { "rate": 0.05, "threshold": 0.1 },
  "toolUsage": {
    "top": [
      { "tool": "read", "count": 500 },
      { "tool": "write", "count": 300 }
    ]
  }
}
```

---

### Memory Graph

#### GET /api/memory-graph

Get memory graph visualization data.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `sinceDays` | `integer` | History window (1–365) |
| `maxNodes` | `integer` | Max nodes (20–2000) |
| `maxFanout` | `integer` | Max fanout per node (1–200) |
| `focus` | `string` | Focus on a specific node ID |
| `format` | `string` | `json` (default) or `dot` |

**Response (JSON):**
```json
{
  "nodes": [{ "id": "sess_abc123", "type": "session", "label": "Wave 7", "timestamp": "2026-02-25T10:00:00Z" }],
  "edges": [{ "source": "sess_abc123", "target": "agent_sisyphus", "type": "uses_agent" }],
  "metadata": { "totalNodes": 150, "totalEdges": 300, "nodeTypes": { "session": 50, "agent": 20, "tool": 30 } }
}
```

**Response (`?format=dot`):** Returns Graphviz DOT format string.

---

### Models

#### GET /api/models

List all registered models.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `provider` | `string` | Filter by provider (`google`, `anthropic`, etc.) |
| `status` | `string` | Filter by status: `healthy`, `degraded`, `error` |

**Response:**
```json
{
  "models": [
    { "id": "claude-sonnet-4-5", "name": "Claude Sonnet 4.5", "provider": "anthropic", "status": "healthy", "latency": 150, "rateLimit": { "requests": 100, "window": "1m" } }
  ]
}
```

---

#### GET /api/models/:id

Get specific model details.

**Response:**
```json
{
  "id": "claude-sonnet-4-5",
  "name": "Claude Sonnet 4.5",
  "provider": "anthropic",
  "status": "healthy",
  "capabilities": ["text", "code", "reasoning"],
  "limits": { "context": 200000, "output": 8192 }
}
```

---

#### GET /api/models/lifecycle

Get lifecycle state for a specific model.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `modelId` | `string` | **Required.** Model identifier |

**Response:**
```json
{
  "modelId": "claude-sonnet-4-5",
  "state": "active",
  "history": [{ "fromState": "candidate", "toState": "active", "actor": "system", "reason": "Approved", "timestamp": 1709740800000 }]
}
```

---

#### GET /api/models/audit

**Auth required** (`models:read`)

Get model audit log. Provide either `modelId` OR both `startTime`+`endTime`.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `modelId` | `string` | Filter by model |
| `startTime` | `integer` | Unix ms timestamp |
| `endTime` | `integer` | Unix ms timestamp |
| `limit` | `integer` | Max entries |

**Response:**
```json
{
  "entries": [{ "modelId": "claude-sonnet-4-5", "fromState": "candidate", "toState": "active", "actor": "system", "diffHash": "sha256...", "timestamp": 1709740800000 }],
  "count": 1
}
```

---

#### POST /api/models/transition

**Auth required** (`models:transition`) · **Rate limited** (10/60s)

Execute a lifecycle state transition. Validates legality, writes SHA-256 diff hash to audit log.

**Request Body:**
```json
{
  "modelId": "claude-sonnet-4-5",
  "toState": "active",
  "actor": "dashboard",
  "reason": "Manual promotion after review",
  "metadata": {}
}
```

**Response:**
```json
{ "success": true, "modelId": "claude-sonnet-4-5", "fromState": "candidate", "toState": "active", "timestamp": 1709740800000 }
```

**Error (400):**
```json
{ "error": "Invalid transition", "message": "Cannot transition from active to candidate", "currentState": "active" }
```

---

### Monitoring

#### GET /api/monitoring

Pipeline metrics in JSON or Prometheus format. Uses in-memory singleton collectors.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | `string` | `json` | `json` or `prometheus` |
| `window` | `integer` | `86400000` | Time window in ms (default: 24h) |
| `section` | `string` | `all` | `all`, `discovery`, `cache`, `transitions`, `pr`, `alerts` |

**Response (`format=json&section=all`):**
```json
{
  "discovery": { "total": 100, "success": 95, "failure": 5 },
  "cache": { "l1": { "hits": 500, "misses": 50 }, "l2": { "hits": 200, "misses": 30 } },
  "transitions": { "total": 20 },
  "prCreation": { "total": 8, "success": 7 },
  "alerts": { "active": [], "summary": { "total": 0, "critical": 0 } }
}
```

**Response (`format=prometheus`):** Prometheus text format (`Content-Type: text/plain; version=0.0.4`)

---

#### POST /api/monitoring

**Auth required** (`metrics:ingest`)

Ingest a metric event.

**Request Body:**
```json
{ "type": "discovery", "data": { "provider": "anthropic", "success": true } }
```

**`type` values:** `discovery`, `cache`, `transition`, `pr`

**Response:**
```json
{ "success": true, "newAlerts": [] }
```

---

### Orchestration

#### GET /api/orchestration

Full orchestration intelligence report. Aggregates session messages, skill RL, learning patterns, provider health, and custom events. **Cached 15 seconds.**

**Query Parameters:**
| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `sinceDays` | `integer` | `30` | 1–365 | History window |
| `topN` | `integer` | `10` | 5–30 | Top N in distributions |
| `coverageTarget` | `float` | `60` | 10–100 | Skill coverage target % |
| `loopWarningThreshold` | `integer` | `3` | 1–50 | Loop count threshold |
| `successTarget` | `float` | `85` | 10–100 | Success rate target % |
| `providerHealthTarget` | `float` | `80` | 10–100 | Provider health target % |
| `noCache` | `1` | — | — | Bypass cache |

**Response (abbreviated):**
```json
{
  "version": "1.0.0",
  "generated_at": "2026-02-26T12:00:00Z",
  "data_fidelity": "live",
  "health": { "score": 87, "level": "healthy", "signals": [] },
  "coverage": { "skill_universe_total": 46, "skills_used_unique": 32, "skill_coverage_ratio": 69.57 },
  "loops": { "total_estimated_loops": 45, "avg_loops_per_session": 0.38 },
  "tokens": { "input": 1500000, "output": 400000, "total": 1900000 },
  "model_distribution": [],
  "skill_distribution": [],
  "pipeline": { "rl_skills": { "general": 20, "task_specific": 5, "avg_success_rate": 0.88 } },
  "frontier": { "autonomy_readiness_score": 72, "governance_score": 85 },
  "integration": { "plugin_inventory": { "configured": 12, "quarantine_active": 0 }, "gaps": [] }
}
```

**`data_fidelity` values:** `live` | `degraded` | `demo`

---

#### POST /api/orchestration

Ingest custom orchestration events. Persists to `~/.opencode/orchestration-events.json`.

**Request Body:**
```json
{
  "events": [{
    "timestamp": "2026-02-26T12:00:00Z",
    "trace_id": "abc123",
    "model": "gemini-2.5-flash",
    "skill": "brainstorming",
    "tool": "read",
    "input_tokens": 1200,
    "output_tokens": 400,
    "latency_ms": 850,
    "provenance": { "source": "opencode-cli", "signature": "hmac-hex..." }
  }],
  "replace": false
}
```

**Response:**
```json
{ "message": "Events ingested", "accepted": 1, "rejected": 0, "total_events": 26, "signing_mode": "allow-unsigned" }
```

Set `OPENCODE_EVENT_SIGNING_KEY` env var to enable HMAC-SHA256 verification.

---

#### GET /api/orchestration/correlation

Correlation distributions across models, skills, tools, outcomes.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sinceDays` | `integer` | `30` | History window (1–365) |

**Response:**
```json
{
  "generated_at": "2026-02-26T12:00:00Z",
  "since_days": 30,
  "totals": { "events": 500, "models": 4, "skills": 28, "tools": 15 },
  "distributions": {
    "model": { "gemini-2.5-flash": 300 },
    "skill": { "brainstorming": 45 },
    "tool": { "read": 120 },
    "outcome": { "success": 450, "error": 30 }
  },
  "data_fidelity": "degraded"
}
```

---

#### GET /api/orchestration/forensics

Forensic event log for debugging.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sessionId` | `string` | — | Filter to specific session |
| `limit` | `integer` | `200` | Max events (1–2000) |

**Response:**
```json
{
  "generated_at": "2026-02-26T12:00:00Z",
  "count": 15,
  "events": [{ "timestamp": "...", "session_id": "ses_abc123", "type": "tool_call" }],
  "data_fidelity": "degraded"
}
```

---

#### GET /api/orchestration/meta-awareness

Meta-awareness overview: composite score, domain signals, stability, RL signal.

**Response:**
```json
{
  "generated_at": "2026-02-26T12:00:00Z",
  "composite": { "score_mean": 78.5, "score_ci_low": 72.0, "score_ci_high": 85.0, "sample_count": 120 },
  "domains": { "accuracy": { "score": 82 }, "efficiency": { "score": 75 } },
  "stability": { "bounded_update_count": 95, "anomaly_count": 2, "confidence_gate": { "accepted": 110, "rejected": 10, "acceptance_rate": 0.917 } },
  "rl_signal": { "accepted": true, "confidence": 0.91, "max_influence": 0.15 },
  "data_fidelity": "live"
}
```

---

#### GET /api/orchestration/meta-awareness/timeline

Historical meta-awareness score timeline.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sinceDays` | `integer` | `30` | History window (1–365) |

**Response:**
```json
{
  "generated_at": "2026-02-26T12:00:00Z",
  "since_days": 30,
  "points": [{ "timestamp": "2026-02-01T00:00:00Z", "score": 74.2, "sample_count": 8 }],
  "data_fidelity": "degraded"
}
```

---

#### POST /api/orchestration/policy-sim

**Auth required** (`policy:simulate`)

Simulate policy enforcement against events without persisting.

**Request Body:**
```json
{
  "events": [{ "model": "gemini-2.5-flash", "total_tokens": 1600, "latency_ms": 850, "provenance": { "signature": "hmac-hex..." } }],
  "policy": {
    "signing_mode": "allow-unsigned",
    "require_trace_ids": false,
    "minimum_fidelity": "degraded",
    "max_p95_latency_ms": 2200,
    "max_p99_latency_ms": 3500
  }
}
```

**`signing_mode` values:** `off` | `allow-unsigned` | `require-signed` | `require-valid-signature`

**Response:**
```json
{
  "summary": { "total": 100, "accepted": 98, "rejected": 2, "acceptance_ratio": 98.0 },
  "rejection_breakdown": { "unsigned": 0, "invalid_signature": 2, "missing_trace_id": 0 },
  "fidelity_projection": { "projected": "live", "minimum_required": "degraded", "pass": true },
  "latency_projection": { "p95_ms": 1850.0, "p99_ms": 2100.0, "pass": true },
  "risk_summary": { "high": false, "replay_determinism_missing": true }
}
```

---

#### GET /api/orchestration/stability

Bounded update count, anomaly count, confidence gate acceptance rate.

**Response:**
```json
{
  "generated_at": "2026-02-26T12:00:00Z",
  "bounded_update_count": 95,
  "anomaly_count": 2,
  "last_anomalies": [],
  "confidence_gate": { "accepted": 110, "rejected": 10, "acceptance_rate": 0.917 },
  "data_fidelity": "live"
}
```

---

### Plugin Supervisor

#### GET /api/plugin-supervisor

Current plugin lifecycle state from `~/.opencode/plugin-runtime-state.json`.

**Response:**
```json
{
  "updated_at": "2026-02-26T12:00:00Z",
  "source": "~/.opencode/plugin-runtime-state.json",
  "summary": { "total": 12, "healthy": 11, "degraded": 1, "unknown": 0, "quarantined": 0 },
  "items": [{ "name": "oh-my-opencode", "status": "healthy", "heartbeat_ok": true, "crash_count": 0 }]
}
```

---

#### POST /api/plugin-supervisor

**Auth required** (`lifecycle:manage`)

Evaluate plugin lifecycle for a batch of plugins.

**Request Body:**
```json
{
  "plugins": [{ "name": "oh-my-opencode", "configured": true, "heartbeat_ok": true, "crash_count": 0 }]
}
```

**Response:** Plugin evaluation results from `PluginLifecycleSupervisor.evaluateMany()`.

---

### Policy Review

#### GET /api/policy-review

Policy review queue status and SLO compliance.

**Response:**
```json
{
  "queue_path": "/home/user/.opencode/policy-review-queue.json",
  "total_items": 15,
  "pending_items": 3,
  "status_counts": { "pending": 3, "approved": 10, "rejected": 2 },
  "slo": { "p95_age_hours": 18.5, "target_p95_hours": 24, "pass": true },
  "sample_pending": [{ "id": "rev-abc123", "status": "pending", "created_at": "2026-02-25T14:00:00Z" }]
}
```

Override queue path with `OPENCODE_POLICY_REVIEW_QUEUE_PATH`. Override SLO target with `OPENCODE_POLICY_REVIEW_P95_SLO_HOURS` (default: 24).

---

### Providers

#### GET /api/providers

List all model providers.

**Response:**
```json
{
  "providers": [{ "id": "anthropic", "name": "Anthropic", "status": "healthy", "models": 3, "healthScore": 98 }]
}
```

---

### Retrieval Quality

#### GET /api/retrieval-quality

Latest retrieval quality report from `~/.opencode/retrieval-quality.json`.

**Response:**
```json
{
  "generated_at": "2026-02-25T10:00:00Z",
  "map_at_k": 0.72,
  "grounded_recall": 0.81,
  "hit_rate_at_k": 0.88,
  "k": 5,
  "sample_size": 200,
  "status": "pass",
  "source": "/home/user/.opencode/retrieval-quality.json"
}
```

**Status thresholds:** `pass` (map_at_k >= 0.7 AND grounded_recall >= 0.75) | `warning` (>= 0.5 / >= 0.6) | `fail`

---

### RL (Reinforcement Learning)

#### GET /api/rl

Skill RL state and per-skill performance.

**Response:**
```json
{
  "skills": { "brainstorming": { "weight": 0.85, "successRate": 0.92, "lastUsed": "2026-02-26T10:00:00Z" } },
  "exploration": { "rate": 0.15, "decay": 0.99 }
}
```

---

### Runs

#### GET /api/runs

List all workflow runs with token usage.

**Response:**
```json
[{ "id": "run_abc123", "status": "completed", "startedAt": "2026-02-26T10:00:00Z", "session_tokens": { "input": 45000, "output": 12000, "total": 57000 } }]
```

---

#### GET /api/runs/:id

Get a specific run with all steps and events.

**Path Parameters:** `id` — Run identifier

**Response:**
```json
{
  "id": "run_abc123",
  "status": "completed",
  "steps": [{ "id": "step_001", "name": "Explore codebase", "status": "completed" }],
  "events": [{ "id": "evt_001", "type": "tool_call", "timestamp": "...", "data": { "tool": "read" } }]
}
```

---

### Skills

#### GET /api/skills

List all available skills.

**Response:**
```json
{
  "skills": [{ "id": "brainstorming", "name": "Brainstorming", "category": "workflow", "description": "Explore requirements before planning" }],
  "total": 46
}
```

---

#### GET /api/skills/promotions

List skill promotion/demotion history (last 200 entries).

**Response:**
```json
{
  "entries": [{ "id": "uuid-v4", "skill": "brainstorming", "action": "promote", "reason": "High success rate", "createdAt": "2026-02-26T10:00:00Z" }]
}
```

---

#### POST /api/skills/promotions

**Auth required** · **Rate limited** (10/60s)

Record a skill promotion or demotion.

**Request Body:**
```json
{ "skill": "brainstorming", "action": "promote", "reason": "High success rate over 30 days" }
```

**`action` values:** `promote` | `demote`

**Response:**
```json
{ "entry": { "id": "uuid-v4", "skill": "brainstorming", "action": "promote", "createdAt": "2026-02-26T10:00:00Z" } }
```

---

### Status

#### GET /api/status/unified

Unified provider status snapshot.

**Query Parameters:** `refresh=true` — force refresh

**Response:**
```json
{
  "version": "1.0.0",
  "timestamp": "2026-02-26T12:00:00Z",
  "providers": { "anthropic": { "status": "healthy" } },
  "summary": { "healthy_count": 3, "warning_count": 1, "critical_count": 0 }
}
```

---

#### GET /api/status/providers

Provider status details, optionally filtered to one provider with history.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `provider_id` | `string` | Specific provider (returns details + history) |
| `refresh` | `true`/`1`/`yes` | Force refresh |

**Response (single provider):**
```json
{
  "provider": { "id": "anthropic", "status": "healthy", "latency_ms": 145 },
  "history": [{ "timestamp": "2026-02-26T11:00:00Z", "status": "healthy", "latency_ms": 140 }]
}
```

---

#### POST /api/status/usage

Ingest a model usage event for telemetry.

**Request Body:**
```json
{
  "provider_id": "anthropic",
  "model_id": "claude-sonnet-4-5",
  "request_id": "req_abc123",
  "success": true,
  "latency_ms": 850,
  "input_tokens": 1200,
  "output_tokens": 400,
  "total_tokens": 1600,
  "request_type": "main",
  "session_id": "ses_abc123",
  "timestamp": "2026-02-26T12:00:00Z"
}
```

**Required:** `provider_id`, `model_id`, `request_id`, `success` (bool), `latency_ms` (>=0)
**`request_type` values:** `main` | `subagent` | `tool`

**Response:**
```json
{ "success": true, "summary": { "total_requests": 1250, "success_rate": 0.972, "avg_latency_ms": 732 } }
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENCODE_EVENT_SIGNING_KEY` | HMAC-SHA256 key for event signature verification |
| `OPENCODE_EVENT_SIGNING_MODE` | Signing mode: `off`, `allow-unsigned`, `require-signed`, `require-valid-signature` |
| `OPENCODE_REPLAY_SEED` | Enable deterministic replay seeding |
| `OPENCODE_POLICY_REVIEW_QUEUE_PATH` | Override path to policy review queue file |
| `OPENCODE_POLICY_REVIEW_P95_SLO_HOURS` | Policy review P95 SLO in hours (default: 24) |
| `OPENCODE_DASHBOARD_WRITE_TOKEN` | Token required for write endpoints |

---

## SDK Examples

### JavaScript

```javascript
// Orchestration health score
const res = await fetch('/api/orchestration?sinceDays=7&topN=10');
const { health } = await res.json();
console.log('Score:', health.score);

// Ingest usage event
await fetch('/api/status/usage', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    provider_id: 'anthropic',
    model_id: 'claude-sonnet-4-5',
    request_id: crypto.randomUUID(),
    success: true,
    latency_ms: 850
  })
});

// Real-time file changes (SSE)
const evtSource = new EventSource('/api/events');
evtSource.onmessage = (e) => {
  const { type, path } = JSON.parse(e.data);
  if (type === 'change') console.log('File changed:', path);
};
```

### cURL

```bash
# System health
curl http://localhost:3000/api/health | jq .status

# Orchestration score (bypass cache)
curl "http://localhost:3000/api/orchestration?sinceDays=7&noCache=1" | jq .health.score

# Prometheus metrics
curl "http://localhost:3000/api/monitoring?format=prometheus"

# Policy simulation
curl -X POST http://localhost:3000/api/orchestration/policy-sim \
  -H "Content-Type: application/json" \
  -H "X-Opencode-Write-Token: $WRITE_TOKEN" \
  -d '{"events":[{"model":"gemini-2.5-flash","total_tokens":1600}],"policy":{"minimum_fidelity":"degraded"}}'

# Transition model state
curl -X POST http://localhost:3000/api/models/transition \
  -H "Content-Type: application/json" \
  -H "X-Opencode-Write-Token: $WRITE_TOKEN" \
  -d '{"modelId":"claude-sonnet-4-5","toState":"active","reason":"Manual approval"}'
```

---

## Changelog

### v2.0.0 (2026-03-08)

- Rewritten from source: all 31 endpoints documented
- Added: `/api/events` SSE, `/api/config`, `/api/docs`, `/api/frontier-status`, `/api/retrieval-quality`
- Added: `/api/plugin-supervisor`, `/api/policy-review`, `/api/runs`, `/api/runs/:id`
- Added: `/api/orchestration/correlation`, `/api/orchestration/forensics`, `/api/orchestration/meta-awareness`, `/api/orchestration/meta-awareness/timeline`, `/api/orchestration/policy-sim`, `/api/orchestration/stability`
- Added: `/api/models/lifecycle`, `/api/models/audit`, `/api/models/transition`
- Added: `/api/status/unified`, `/api/status/providers`, `/api/status/usage`
- Added: `/api/skills/promotions`, `POST /api/monitoring`
- Added: Environment Variables reference table
- Corrected inaccurate response shapes from v1

### v1.0.0 (2026-02-26)

- Initial API documentation (20 endpoints)
- Added rate limiting info
