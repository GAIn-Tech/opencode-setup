# OpenCode Dashboard API Documentation

Complete API reference for OpenCode Dashboard endpoints.

## Base URL

```
http://localhost:3000/api
```

## Authentication

All endpoints require authentication via session cookie or Bearer token.

## Endpoints

### Health

#### GET /api/health

System health check.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-26T12:00:00Z",
  "version": "1.0.0"
}
```

**Status Codes:**
- 200: System healthy
- 503: Service unavailable

---

### Models

#### GET /api/models

List all registered models.

**Query Parameters:**
- `provider` (optional): Filter by provider (google, anthropic, openai, etc.)
- `status` (optional): Filter by status (healthy, degraded, error)

**Response:**
```json
{
  "models": [
    {
      "id": "gpt-5",
      "name": "GPT-5",
      "provider": "openai",
      "status": "healthy",
      "latency": 150,
      "rateLimit": {
        "requests": 100,
        "window": "1m"
      }
    }
  ]
}
```

#### GET /api/models/:id

Get specific model details.

**Path Parameters:**
- `id`: Model identifier

**Response:**
```json
{
  "id": "gpt-5",
  "name": "GPT-5",
  "provider": "openai",
  "status": "healthy",
  "capabilities": ["text", "code", "reasoning"],
  "limits": {
    "context": 128000,
    "output": 4096
  }
}
```

---

### Providers

#### GET /api/providers

List all model providers.

**Response:**
```json
{
  "providers": [
    {
      "id": "openai",
      "name": "OpenAI",
      "status": "healthy",
      "models": 5,
      "healthScore": 98
    }
  ]
}
```

#### GET /api/providers/:id/health

Get provider health metrics.

**Path Parameters:**
- `id`: Provider identifier

**Response:**
```json
{
  "provider": "openai",
  "status": "healthy",
  "latency": {
    "avg": 150,
    "p95": 250,
    "p99": 500
  },
  "errorRate": 0.01,
  "lastError": null
}
```

---

### Orchestration

#### GET /api/orchestration

Get orchestration status and policy simulation data.

**Query Parameters:**
- `sinceDays` (optional): Days of history (1-365, default: 30)
- `topN` (optional): Top N patterns (1-100, default: 10)
- `coverageTarget` (optional): Coverage target percentage
- `successTarget` (optional): Success rate target

**Response:**
```json
{
  "healthScore": 85,
  "frontierReadiness": 0.92,
  "signals": {
    "learningRate": 0.15,
    "explorationRate": 0.25,
    "successRate": 0.88
  },
  "integrationGaps": [
    {
      "type": "tool",
      "name": "custom-search",
      "severity": "medium"
    }
  ],
  "dataFidelity": {
    "coverage": 0.75,
    "quality": 0.92
  }
}
```

#### POST /api/orchestration/events

Record orchestration events.

**Request Body:**
```json
{
  "events": [
    {
      "type": "tool_usage",
      "tool": "search",
      "duration": 1500,
      "success": true
    }
  ],
  "mode": "append"
}
```

**Response:**
```json
{
  "recorded": 1,
  "timestamp": "2026-02-26T12:00:00Z"
}
```

---

### Memory Graph

#### GET /api/memory-graph

Get memory graph visualization data.

**Query Parameters:**
- `sinceDays` (optional): History days (1-365)
- `maxNodes` (optional): Max nodes (20-2000)
- `maxFanout` (optional): Max fanout (1-200)
- `focus` (optional): Focus node ID
- `format` (optional): Output format (json, dot)

**Response:**
```json
{
  "nodes": [
    {
      "id": "sess_abc123",
      "type": "session",
      "label": "Wave 7 Implementation",
      "timestamp": "2026-02-25T10:00:00Z"
    }
  ],
  "edges": [
    {
      "source": "sess_abc123",
      "target": "agent_sisyphus",
      "type": "uses_agent"
    }
  ],
  "metadata": {
    "totalNodes": 150,
    "totalEdges": 300,
    "nodeTypes": {
      "session": 50,
      "agent": 20,
      "tool": 30
    }
  }
}
```

**DOT Format:**
```
GET /api/memory-graph?format=dot
```

Returns Graphviz DOT format for visualization.

---

### Learning

#### GET /api/learning

Get learning engine statistics.

**Query Parameters:**
- `sinceDays` (optional): Days of history

**Response:**
```json
{
  "patterns": {
    "total": 150,
    "active": 45,
    "core": 12
  },
  "decay": {
    "rate": 0.05,
    "threshold": 0.1
  },
  "toolUsage": {
    "top": [
      { "tool": "read", "count": 500 },
      { "tool": "write", "count": 300 }
    ]
  }
}
```

---

### Skills

#### GET /api/skills

List available skills.

**Response:**
```json
{
  "skills": [
    {
      "id": "brainstorming",
      "name": "Brainstorming",
      "category": "workflow",
      "description": "Explore requirements before planning"
    }
  ],
  "total": 46
}
```

---

### Monitoring

#### GET /api/monitoring/metrics

Get system metrics (Prometheus format).

**Response:**
```
# HELP opencode_requests_total Total requests
# TYPE opencode_requests_total counter
opencode_requests_total 1500

# HELP opencode_request_duration_seconds Request duration
# TYPE opencode_request_duration_seconds histogram
opencode_request_duration_seconds_bucket{le="0.1"} 500
```

**JSON Format:**
```bash
GET /api/monitoring/metrics?format=json
```

---

### RL (Reinforcement Learning)

#### GET /api/rl

Get RL state and skill performance.

**Response:**
```json
{
  "skills": {
    "brainstorming": {
      "weight": 0.85,
      "successRate": 0.92,
      "lastUsed": "2026-02-26T10:00:00Z"
    }
  },
  "exploration": {
    "rate": 0.15,
    "decay": 0.99
  }
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found",
    "status": 404
  }
}
```

**Common Error Codes:**
- 400: Bad Request
- 401: Unauthorized
- 404: Not Found
- 429: Rate Limited
- 500: Internal Server Error
- 503: Service Unavailable

---

## Rate Limiting

API endpoints are rate limited per IP:

- **Authenticated**: 1000 requests/minute
- **Anonymous**: 100 requests/minute

Rate limit headers included in responses:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1645874400
```

---

## Caching

Responses include cache headers:

```
Cache-Control: public, max-age=60
ETag: "abc123"
```

---

## WebSocket Support

Real-time updates available via WebSocket:

```javascript
const ws = new WebSocket('ws://localhost:3000/api/ws');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle real-time updates
};
```

Events: `model.update`, `provider.health`, `orchestration.signal`

---

## SDK Examples

### JavaScript

```javascript
// Get model list
const response = await fetch('/api/models');
const data = await response.json();

// Record event
await fetch('/api/orchestration/events', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ events: [...] })
});
```

### cURL

```bash
# Get health
curl http://localhost:3000/api/health

# Get memory graph
curl "http://localhost:3000/api/memory-graph?sinceDays=7&format=dot"

# Record event
curl -X POST http://localhost:3000/api/orchestration/events \
  -H "Content-Type: application/json" \
  -d '{"events": [{"type": "test", "success": true}]}'
```

---

## Changelog

### v1.0.0 (2026-02-26)

- Initial API documentation
- 20 endpoints documented
- Added rate limiting info
- Added WebSocket support docs
