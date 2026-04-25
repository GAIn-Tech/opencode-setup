import { log } from "./logger"
import * as connectedProvidersCache from "./connected-providers-cache"
import { fuzzyMatchModel } from "./model-availability"
import type { FallbackEntry } from "./model-requirements"
import { transformModelForProvider } from "./provider-model-id-transform"
import { normalizeModel } from "./model-normalization"
import { UserPreference } from "./user-preference"

export type ModelResolutionRequest = {
  intent?: {
    uiSelectedModel?: string
    userModel?: string
    userFallbackModels?: string[]
    categoryDefaultModel?: string
  }
  constraints: {
    availableModels: Set<string>
    connectedProviders?: string[] | null
  }
  policy?: {
    fallbackChain?: FallbackEntry[]
    systemDefaultModel?: string
  }
}

export type ModelResolutionProvenance =
  | "override"
  | "category-default"
  | "provider-fallback"
  | "system-default"

export type ModelResolutionResult = {
  model: string
  provenance: ModelResolutionProvenance
  variant?: string
  attempted?: string[]
  reason?: string
}

const userPreference = new UserPreference()
let cachedPreferredModel: string | null = normalizeModel((await userPreference.load()) ?? undefined) ?? null

export function resetModelPreferenceCacheForTest(): void {
  cachedPreferredModel = null
}

function saveResolvedPreference(model: string): void {
  const normalized = normalizeModel(model)
  if (!normalized) return
  cachedPreferredModel = normalized
  void userPreference.save(normalized)
}

function finalizeResolution(
  result: ModelResolutionResult,
  options?: { persistPreference?: boolean }
): ModelResolutionResult {
  if (options?.persistPreference) {
    saveResolvedPreference(result.model)
  }

  return result
}


export function resolveModelPipeline(
  request: ModelResolutionRequest,
): ModelResolutionResult | undefined {
  const attempted: string[] = []
  const { intent, constraints, policy } = request
  const availableModels = constraints.availableModels
  const fallbackChain = policy?.fallbackChain
  const systemDefaultModel = policy?.systemDefaultModel

  const normalizedUiModel = normalizeModel(intent?.uiSelectedModel)
  if (normalizedUiModel) {
    log("Model resolved via UI selection", { model: normalizedUiModel })
    return finalizeResolution({ model: normalizedUiModel, provenance: "override" }, { persistPreference: true })
  }

  const normalizedUserModel = normalizeModel(intent?.userModel)
  const normalizedCategoryDefault = normalizeModel(intent?.categoryDefaultModel)

  const normalizedPreferredModel = normalizeModel(cachedPreferredModel ?? undefined)
  if (normalizedPreferredModel && !normalizedUserModel && !normalizedCategoryDefault) {
    attempted.push(normalizedPreferredModel)
    if (availableModels.size > 0) {
      const parts = normalizedPreferredModel.split("/")
      const providerHint = parts.length >= 2 ? [parts[0]] : undefined
      const match = fuzzyMatchModel(normalizedPreferredModel, availableModels, providerHint)
      if (match) {
        log("Model resolved via persisted user preference (fuzzy matched)", {
          original: normalizedPreferredModel,
          matched: match,
        })
        return finalizeResolution({ model: match, provenance: "override", attempted })
      }
    } else {
      const connectedProviders = constraints.connectedProviders ?? connectedProvidersCache.readConnectedProvidersCache()
      if (connectedProviders === null) {
        log("Model resolved via persisted user preference (no cache, first run)", {
          model: normalizedPreferredModel,
        })
        return finalizeResolution({ model: normalizedPreferredModel, provenance: "override", attempted })
      }
      const parts = normalizedPreferredModel.split("/")
      if (parts.length >= 2) {
        const provider = parts[0]
        if (connectedProviders.includes(provider)) {
          const modelName = parts.slice(1).join("/")
          const transformedModel = `${provider}/${transformModelForProvider(provider, modelName)}`
          log("Model resolved via persisted user preference (connected provider)", {
            model: transformedModel,
            original: normalizedPreferredModel,
          })
          return finalizeResolution({ model: transformedModel, provenance: "override", attempted })
        }
      }
    }
    log("Persisted user preference model not available, falling through to config override", {
      model: normalizedPreferredModel,
    })
  }

  if (normalizedUserModel) {
    log("Model resolved via config override", { model: normalizedUserModel })
    return finalizeResolution({ model: normalizedUserModel, provenance: "override" }, { persistPreference: true })
  }

  if (normalizedCategoryDefault) {
    attempted.push(normalizedCategoryDefault)
    if (availableModels.size > 0) {
      const parts = normalizedCategoryDefault.split("/")
      const providerHint = parts.length >= 2 ? [parts[0]] : undefined
      const match = fuzzyMatchModel(normalizedCategoryDefault, availableModels, providerHint)
      if (match) {
        log("Model resolved via category default (fuzzy matched)", {
          original: normalizedCategoryDefault,
          matched: match,
        })
        return finalizeResolution({ model: match, provenance: "category-default", attempted })
      }
    } else {
      const connectedProviders = constraints.connectedProviders ?? connectedProvidersCache.readConnectedProvidersCache()
      if (connectedProviders === null) {
        log("Model resolved via category default (no cache, first run)", {
          model: normalizedCategoryDefault,
        })
        return finalizeResolution({ model: normalizedCategoryDefault, provenance: "category-default", attempted })
      }
      const parts = normalizedCategoryDefault.split("/")
      if (parts.length >= 2) {
        const provider = parts[0]
        if (connectedProviders.includes(provider)) {
          const modelName = parts.slice(1).join("/")
          const transformedModel = `${provider}/${transformModelForProvider(provider, modelName)}`
          log("Model resolved via category default (connected provider)", {
            model: transformedModel,
            original: normalizedCategoryDefault,
          })
          return finalizeResolution({ model: transformedModel, provenance: "category-default", attempted })
        }
      }
    }
    log("Category default model not available, falling through to fallback chain", {
      model: normalizedCategoryDefault,
    })
  }

  //#when - user configured fallback_models, try them before hardcoded fallback chain
  const userFallbackModels = intent?.userFallbackModels
  if (userFallbackModels && userFallbackModels.length > 0) {
    if (availableModels.size === 0) {
      const connectedProviders = constraints.connectedProviders ?? connectedProvidersCache.readConnectedProvidersCache()
      const connectedSet = connectedProviders ? new Set(connectedProviders) : null

      if (connectedSet !== null) {
        for (const model of userFallbackModels) {
          attempted.push(model)
          const parts = model.split("/")
          if (parts.length >= 2) {
            const provider = parts[0]
            if (connectedSet.has(provider)) {
              const modelName = parts.slice(1).join("/")
              const transformedModel = `${provider}/${transformModelForProvider(provider, modelName)}`
              log("Model resolved via user fallback_models (connected provider)", { model: transformedModel, original: model })
              return finalizeResolution({ model: transformedModel, provenance: "provider-fallback", attempted })
            }
          }
        }
        log("No connected provider found in user fallback_models, falling through to hardcoded chain")
      }
    } else {
      for (const model of userFallbackModels) {
        attempted.push(model)
        const parts = model.split("/")
        const providerHint = parts.length >= 2 ? [parts[0]] : undefined
        const match = fuzzyMatchModel(model, availableModels, providerHint)
        if (match) {
          log("Model resolved via user fallback_models (availability confirmed)", { model: model, match })
          return finalizeResolution({ model: match, provenance: "provider-fallback", attempted })
        }
      }
      log("No available model found in user fallback_models, falling through to hardcoded chain")
    }
  }

  if (fallbackChain && fallbackChain.length > 0) {
    if (availableModels.size === 0) {
      const connectedProviders = constraints.connectedProviders ?? connectedProvidersCache.readConnectedProvidersCache()
      const connectedSet = connectedProviders ? new Set(connectedProviders) : null

      if (connectedSet === null) {
        log("Model fallback chain skipped (no connected providers cache) - falling through to system default")
      } else {
        for (const entry of fallbackChain) {
          for (const provider of entry.providers) {
            if (connectedSet.has(provider)) {
              const transformedModelId = transformModelForProvider(provider, entry.model)
              const model = `${provider}/${transformedModelId}`
              log("Model resolved via fallback chain (connected provider)", {
                provider,
                model: transformedModelId,
                variant: entry.variant,
              })
              return finalizeResolution({
                model,
                provenance: "provider-fallback",
                variant: entry.variant,
                attempted,
              })
            }
          }
        }
        log("No connected provider found in fallback chain, falling through to system default")
      }
    } else {
      for (const entry of fallbackChain) {
        for (const provider of entry.providers) {
          const fullModel = `${provider}/${entry.model}`
          const match = fuzzyMatchModel(fullModel, availableModels, [provider])
          if (match) {
            log("Model resolved via fallback chain (availability confirmed)", {
              provider,
              model: entry.model,
              match,
              variant: entry.variant,
            })
            return finalizeResolution({
              model: match,
              provenance: "provider-fallback",
              variant: entry.variant,
              attempted,
            })
          }
        }

        const crossProviderMatch = fuzzyMatchModel(entry.model, availableModels)
        if (crossProviderMatch) {
          log("Model resolved via fallback chain (cross-provider fuzzy match)", {
            model: entry.model,
            match: crossProviderMatch,
            variant: entry.variant,
          })
          return finalizeResolution({
            model: crossProviderMatch,
            provenance: "provider-fallback",
            variant: entry.variant,
            attempted,
          })
        }
      }
      log("No available model found in fallback chain, falling through to system default")
    }
  }

  if (systemDefaultModel === undefined) {
    log("No model resolved - systemDefaultModel not configured")
    return undefined
  }

  log("Model resolved via system default", { model: systemDefaultModel })
  return finalizeResolution({ model: systemDefaultModel, provenance: "system-default", attempted })
}
