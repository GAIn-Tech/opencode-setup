import type { OpencodeClient } from "./types"
import { QUESTION_DENIED_SESSION_PERMISSION } from "../../shared/question-denied-session-permission"
import { resolveSessionDirectory } from "../../shared/session-directory-resolver"
import { subagentSessions } from "../../features/claude-code-session-state"

export async function createSyncSession(
  client: OpencodeClient,
  input: { parentSessionID: string; agentToUse: string; description: string; defaultDirectory: string }
): Promise<{ ok: true; sessionID: string; parentDirectory: string } | { ok: false; error: string }> {
  const parentSession = client.session.get
    ? await client.session.get({ path: { id: input.parentSessionID } }).catch(() => null)
    : null
  const rawParentDirectory = parentSession?.data?.directory ?? input.defaultDirectory
  const parentDirectory = resolveSessionDirectory({
    parentDirectory: rawParentDirectory,
    fallbackDirectory: input.defaultDirectory,
  })

  const createResult = await client.session.create({
    body: {
      parentID: input.parentSessionID,
      title: `${input.description} (@${input.agentToUse} subagent)`,
      permission: QUESTION_DENIED_SESSION_PERMISSION,
    } as Record<string, unknown>,
    query: {
      directory: parentDirectory,
    },
  })

  if (createResult.error) {
    return { ok: false, error: `Failed to create session: ${createResult.error}` }
  }

  // Track this as a subagent session so it doesn't affect main session model persistence
  subagentSessions.add(createResult.data.id)

  return { ok: true, sessionID: createResult.data.id, parentDirectory }
}
