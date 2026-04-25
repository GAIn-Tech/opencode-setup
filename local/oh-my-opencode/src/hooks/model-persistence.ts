import type { PluginInput } from "@opencode-ai/plugin"
import { setSessionModel, clearSessionModel, getSessionModel } from "../shared/session-model-state"
import { log } from "../shared/logger"
import { isMainSession } from "../features/claude-code-session-state"

const HOOK_NAME = "model-persistence"

/**
 * Creates a hook that captures the selected model from chat messages
 * and persists it to session state for auto-continuation.
 * 
 * IMPORTANT: Only persists models for the MAIN session. Subagents and
 * background tasks can have their own model switching/fallbacks without
 * affecting the main session's model.
 */
export function createModelPersistenceHook() {
  return {
    "chat.message": async (
      input: {
        sessionID: string
        model?: { providerID: string; modelID: string; variant?: string }
        agent?: string
      },
      _output: unknown
    ): Promise<void> => {
      const { sessionID, model, agent } = input

      // Only persist models for the main session
      // Subagents and background tasks can switch models freely
      if (!isMainSession(sessionID)) {
        log(`[${HOOK_NAME}] Skipping model persistence for subagent/background session`, {
          sessionID,
          isMainSession: false,
        })
        return
      }

      if (model && sessionID) {
        // Only user messages (with agent field) can persist models
        // Tool/DCP/continuation messages should not initialize or overwrite session model
        if (agent) {
          setSessionModel(sessionID, model)
          log(`[${HOOK_NAME}] Model saved for main session`, {
            sessionID,
            providerID: model.providerID,
            modelID: model.modelID,
            variant: model.variant,
          })
        }
      }
    },

    event: async ({ event }: { event: { type: string; properties?: unknown } }): Promise<void> => {
      if (event.type === "session.deleted") {
        const props = event.properties as { info?: { id?: string } } | undefined
        const sessionID = props?.info?.id
        if (sessionID) {
          clearSessionModel(sessionID)
          log(`[${HOOK_NAME}] Model cleared for deleted session`, { sessionID })
        }
      }
    },
  }
}
