import type { OpencodeClient } from "./types"
import type { SessionMessage } from "./executor-types"
import { normalizeSDKResponse } from "../../shared"

// validateResponse for early failure detection - copied from response-validator.js
// Using inline version to avoid cross-package dependency
function validateResponse(response: { content?: string }, options: { minContentLength?: number } = {}) {
  const minContentLength = options.minContentLength ?? 10
  const content = response.content ?? ""
  
  if (!content || content.trim().length === 0) {
    return { valid: false, failureType: "EMPTY_RESPONSE", message: "Response content is empty" }
  }
  
  if (content.trim().length < minContentLength) {
    return { valid: false, failureType: "EMPTY_RESPONSE", message: `Response too short (${content.trim().length} < ${minContentLength} chars)` }
  }
  
  // Check for common failure patterns
  const contentLower = content.toLowerCase()
  if (contentLower.includes("rate limit") || contentLower.includes("too many requests")) {
    return { valid: false, failureType: "RATE_LIMITED", message: "Response indicates rate limiting" }
  }
  if (contentLower.includes("unavailable") || contentLower.includes("not found") || contentLower.includes("deprecated")) {
    return { valid: false, failureType: "MODEL_UNAVAILABLE", message: "Response indicates model unavailable" }
  }
  if (contentLower.includes("unauthorized") || contentLower.includes("invalid api")) {
    return { valid: false, failureType: "AUTH_ERROR", message: "Response indicates auth error" }
  }
  
  return { valid: true, failureType: null, message: "Response is valid" }
}

export async function fetchSyncResult(
  client: OpencodeClient,
  sessionID: string,
  anchorMessageCount?: number
): Promise<{ ok: true; textContent: string } | { ok: false; error: string }> {
  const messagesResult = await client.session.messages({
    path: { id: sessionID },
  })

  if ((messagesResult as { error?: unknown }).error) {
    return { ok: false, error: `Error fetching result: ${(messagesResult as { error: unknown }).error}\n\nSession ID: ${sessionID}` }
  }

  const messages = normalizeSDKResponse(messagesResult, [] as SessionMessage[], {
    preferResponseOnMissingData: true,
  })

  const messagesAfterAnchor = anchorMessageCount !== undefined ? messages.slice(anchorMessageCount) : messages

  if (anchorMessageCount !== undefined && messagesAfterAnchor.length === 0) {
    return {
      ok: false,
      error: `Session completed but no new response was generated. The model may have failed silently.\n\nSession ID: ${sessionID}`,
    }
  }

  const assistantMessages = messagesAfterAnchor
    .filter((m) => m.info?.role === "assistant")
    .sort((a, b) => (b.info?.time?.created ?? 0) - (a.info?.time?.created ?? 0))
  const lastMessage = assistantMessages[0]

  if (anchorMessageCount !== undefined && !lastMessage) {
    return {
      ok: false,
      error: `Session completed but no new response was generated. The model may have failed silently.\n\nSession ID: ${sessionID}`,
    }
  }

  if (!lastMessage) {
    return { ok: false, error: `No assistant response found.\n\nSession ID: ${sessionID}` }
  }

  // Search assistant messages (newest first) for one with text/reasoning content.
  // The last assistant message may only contain tool calls with no text.
  let textContent = ""
  for (const msg of assistantMessages) {
    const textParts = msg.parts?.filter((p) => p.type === "text" || p.type === "reasoning") ?? []
    const content = textParts.map((p) => p.text ?? "").filter(Boolean).join("\n")
    if (content) {
      textContent = content
      break
    }
  }

  // Validate response for early failure detection (gap-audit integration)
  const validation = validateResponse({ content: textContent })
  if (!validation.valid) {
    return {
      ok: false,
      error: `Response validation failed: ${validation.message}\nFailure type: ${validation.failureType}\n\nSession ID: ${sessionID}`,
    }
  }

  return { ok: true, textContent }
}
