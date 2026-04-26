export type SessionModel = { providerID: string; modelID: string; variant?: string }

const sessionModels = new Map<string, SessionModel>()

export function setSessionModel(sessionID: string, model: SessionModel): void {
  sessionModels.set(sessionID, {
    providerID: model.providerID,
    modelID: model.modelID,
    ...(model.variant !== undefined ? { variant: model.variant } : {}),
  })
}

export function getSessionModel(sessionID: string): SessionModel | undefined {
  const model = sessionModels.get(sessionID)
  if (!model) {
    return undefined
  }

  return {
    providerID: model.providerID,
    modelID: model.modelID,
    ...(model.variant !== undefined ? { variant: model.variant } : {}),
  }
}

export function clearSessionModel(sessionID: string): void {
  sessionModels.delete(sessionID)
}
