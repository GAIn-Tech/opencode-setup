---
name: token-reporter
description: Report token usage to the workflows dashboard. Use to track token consumption per session when the CLI doesn't automatically report tokens.
---

## Overview

This skill reports token usage data to the OpenCode workflows dashboard. Use it when you want to track token consumption in the dashboard but automatic reporting isn't available.

## When to Use

Use this skill when:

- User asks to "report tokens", "track tokens", or "log token usage"
- User provides token counts from an external source or manual calculation
- Dashboard shows 0 tokens for a session that should have token data
- User wants to manually log token consumption

## Inputs Required

Collect the following from the user:

- **session_id**: The OpenCode session ID (format: `ses_xxxxx`)
- **provider_id**: LLM provider (e.g., `openai`, `anthropic`)
- **model_id**: Model identifier (e.g., `gpt-4o`, `claude-3-opus-20240229`)
- **input_tokens**: Number of input tokens (optional, defaults to 0)
- **output_tokens**: Number of output tokens (optional, defaults to 0)
- **total_tokens**: Total tokens (optional, defaults to input + output)
- **success**: Whether the request succeeded (optional, defaults to true)
- **latency_ms**: Request latency in milliseconds (optional)

## Execution Steps

### Step 1: Validate Inputs

Ensure session_id is provided and looks valid (starts with `ses_`).

### Step 2: Send to Dashboard API

Make a POST request to the dashboard's usage endpoint:

```bash
curl -X POST http://localhost:3000/api/status/usage \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "<session_id>",
    "provider_id": "<provider_id>",
    "model_id": "<model_id>",
    "input_tokens": <input_tokens>,
    "output_tokens": <output_tokens>,
    "total_tokens": <total_tokens>,
    "success": true,
    "latency_ms": <latency_ms>
  }'
```

Replace values with actual data.

### Step 3: Confirm Success

Report back to the user:
- Number of tokens reported
- Which session was updated
- A reminder that they can view the data in the dashboard

## Example Dialog

**User**: "Report 5000 input and 2000 output tokens for session ses_abc123 using GPT-4o"

**You**: "I'll report that token usage to the dashboard."

```bash
curl -X POST http://localhost:3000/api/status/usage \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "ses_abc123",
    "provider_id": "openai",
    "model_id": "gpt-4o",
    "input_tokens": 5000,
    "output_tokens": 2000,
    "total_tokens": 7000,
    "success": true,
    "latency_ms": 1500
  }'
```

**Response**: "Successfully reported 7,000 tokens (5,000 input + 2,000 output) for session ses_abc123. View it in the dashboard at /workflows."

## Notes

- This skill is a workaround for when automatic token reporting isn't available
- The dashboard API accepts these optional fields: `input_tokens`, `output_tokens`, `total_tokens`, `success`, `latency_ms`
- If `total_tokens` is not provided, it will be calculated as `input_tokens + output_tokens`
- Token data is aggregated by session in the dashboard's workflows section
