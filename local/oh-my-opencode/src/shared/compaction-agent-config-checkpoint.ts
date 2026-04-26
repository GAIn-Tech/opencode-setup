import type { SessionPromptParams } from "./session-prompt-params-state"

export type CompactionAgentConfigCheckpoint = {
  agent?: string
  model?: { providerID: string; modelID: string; variant?: string }
  tools?: Record<string, boolean>
  promptParams?: SessionPromptParams
}

const checkpoints = new Map<string, CompactionAgentConfigCheckpoint>()

function cloneCheckpoint(
  checkpoint: CompactionAgentConfigCheckpoint,
): CompactionAgentConfigCheckpoint {
  return {
    ...(checkpoint.agent ? { agent: checkpoint.agent } : {}),
    ...(checkpoint.model
      ? {
          model: {
            providerID: checkpoint.model.providerID,
            modelID: checkpoint.model.modelID,
            ...(checkpoint.model.variant !== undefined
              ? { variant: checkpoint.model.variant }
              : {}),
          },
        }
      : {}),
    ...(checkpoint.tools ? { tools: { ...checkpoint.tools } } : {}),
    ...(checkpoint.promptParams
      ? {
          promptParams: {
            ...(checkpoint.promptParams.temperature !== undefined
              ? { temperature: checkpoint.promptParams.temperature }
              : {}),
            ...(checkpoint.promptParams.topP !== undefined
              ? { topP: checkpoint.promptParams.topP }
              : {}),
            ...(checkpoint.promptParams.maxOutputTokens !== undefined
              ? { maxOutputTokens: checkpoint.promptParams.maxOutputTokens }
              : {}),
            ...(checkpoint.promptParams.options !== undefined
              ? { options: { ...checkpoint.promptParams.options } }
              : {}),
          },
        }
      : {}),
  }
}

export function setCompactionAgentConfigCheckpoint(
  sessionID: string,
  checkpoint: CompactionAgentConfigCheckpoint,
): void {
  checkpoints.set(sessionID, cloneCheckpoint(checkpoint))
}

export function getCompactionAgentConfigCheckpoint(
  sessionID: string,
): CompactionAgentConfigCheckpoint | undefined {
  const checkpoint = checkpoints.get(sessionID)
  return checkpoint ? cloneCheckpoint(checkpoint) : undefined
}

export function clearCompactionAgentConfigCheckpoint(sessionID: string): void {
  checkpoints.delete(sessionID)
}
