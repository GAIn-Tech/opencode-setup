import type { HookDeps } from "./types"
import { HOOK_NAME } from "./constants"
import { log } from "../../shared/logger"
import { createFallbackState } from "./fallback-state"
import { setSessionModel } from "../../shared/session-model-state"
import { parseModelString } from "../../tools/delegate-task/model-string-parser"

export function createChatMessageHandler(deps: HookDeps) {
  const { config, sessionStates, sessionLastAccess } = deps

  return async (
    input: { sessionID: string; agent?: string; model?: { providerID: string; modelID: string } },
    output: { message: { model?: { providerID: string; modelID: string }; variant?: string }; parts?: Array<{ type: string; text?: string }> }
  ) => {
    if (!config.enabled) return

    const { sessionID } = input
    let state = sessionStates.get(sessionID)

    if (!state) return

    sessionLastAccess.set(sessionID, Date.now())

    const requestedModel = input.model
      ? `${input.model.providerID}/${input.model.modelID}`
      : undefined

    if (requestedModel && requestedModel !== state.currentModel) {
      if (state.pendingFallbackModel && state.pendingFallbackModel === requestedModel) {
        state.pendingFallbackModel = undefined
        return
      }

      log(`[${HOOK_NAME}] Detected manual model change, resetting fallback state`, {
        sessionID,
        from: state.currentModel,
        to: requestedModel,
      })
      state = createFallbackState(requestedModel)
      sessionStates.set(sessionID, state)
      return
    }

    if (state.currentModel === state.originalModel) return

    const activeModel = state.currentModel

    log(`[${HOOK_NAME}] Applying fallback model override`, {
      sessionID,
      from: input.model,
      to: activeModel,
    })

    if (output.message && activeModel) {
      const parsedModel = parseModelString(activeModel)
      if (parsedModel) {
        output.message.model = {
          providerID: parsedModel.providerID,
          modelID: parsedModel.modelID,
        }
        if (parsedModel.variant !== undefined) {
          output.message.variant = parsedModel.variant
        }
        setSessionModel(sessionID, {
          providerID: parsedModel.providerID,
          modelID: parsedModel.modelID,
          ...(parsedModel.variant !== undefined ? { variant: parsedModel.variant } : {}),
        })
      }
    }
  }
}
