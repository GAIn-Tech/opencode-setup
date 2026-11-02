import type { FallbackEntry } from "../../shared/model-requirements"
import { parseModelString } from "../../tools/delegate-task/model-string-parser"

export function buildRetryModelPayload(
  model: string,
  settings?: Pick<FallbackEntry, "variant" | "reasoningEffort">,
): { model: { providerID: string; modelID: string }; variant?: string; reasoningEffort?: string } | undefined {
  const parsedModel = parseModelString(model)
  if (!parsedModel) {
    return undefined
  }

  const variant = parsedModel.variant ?? settings?.variant
  const reasoningEffort = settings?.reasoningEffort

  const payload: { model: { providerID: string; modelID: string }; variant?: string; reasoningEffort?: string } = {
    model: {
      providerID: parsedModel.providerID,
      modelID: parsedModel.modelID,
    },
  }

  if (variant) {
    payload.variant = variant
  }
  if (reasoningEffort) {
    payload.reasoningEffort = reasoningEffort
  }

  return payload
}
