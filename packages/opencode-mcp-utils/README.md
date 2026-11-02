# opencode-mcp-utils

Shared MCP handler helpers for OpenCode servers.

## Exports

- `createTextPayload(payload, options?)`
- `createErrorPayload(message, extra?, options?)`
- `toErrorMessage(error)`
- `isMcpPayload(value)`
- `wrapMcpHandler(handler, options?)`

## Usage

```js
import { wrapMcpHandler } from 'opencode-mcp-utils';

const handler = wrapMcpHandler(
  async ({ sessionId }) => ({ status: governor.getRemainingBudget(sessionId) }),
  {
    source: 'context-governor:getContextBudgetStatus',
    errorExtras: (_error, input) => ({ sessionId: input?.sessionId ?? null }),
  },
);
```

`wrapMcpHandler` behavior:

- Converts successful outputs to MCP text + structured payloads.
- Converts thrown errors to MCP error payloads (`isError: true`).
- Emits optional telemetry hooks (`onSuccess`, `onError`).
- Logs handler failures with source tag.
- Can pass through existing payloads when handlers already return MCP payload objects.
