import { afterEach, describe, expect, test } from "bun:test"

import { getFallbackModelsForSession, getSelectedFallbackEntry } from "./fallback-models"
import { SessionCategoryRegistry } from "../../shared/session-category-registry"

describe("runtime-fallback fallback-models", () => {
  afterEach(() => {
    SessionCategoryRegistry.clear()
  })

  test("uses category fallback_models when session category is registered", () => {
    //#given
    const sessionID = "ses_runtime_fallback_category"
    SessionCategoryRegistry.register(sessionID, "quick")
    const pluginConfig = {
      categories: {
        quick: {
          fallback_models: ["openai/gpt-5.2", "anthropic/claude-opus-4-6"],
        },
      },
    } as any

    //#when
    const result = getFallbackModelsForSession(sessionID, undefined, pluginConfig)

    //#then
    expect(result).toEqual(["openai/gpt-5.2", "anthropic/claude-opus-4-6"])
  })

  test("uses agent-specific fallback_models when agent is resolved", () => {
    //#given
    const pluginConfig = {
      agents: {
        oracle: {
          fallback_models: ["openai/gpt-5.2", "anthropic/claude-opus-4-6"],
        },
      },
    } as any

    //#when
    const result = getFallbackModelsForSession("ses_runtime_fallback_agent", "oracle", pluginConfig)

    //#then
    expect(result).toEqual(["openai/gpt-5.2", "anthropic/claude-opus-4-6"])
  })

  test("does not fall back to another agent chain when agent cannot be resolved", () => {
    //#given
    const pluginConfig = {
      agents: {
        sisyphus: {
          fallback_models: ["quotio/gpt-5.2", "quotio/glm-5", "quotio/kimi-k2.5"],
        },
        oracle: {
          fallback_models: ["openai/gpt-5.2", "anthropic/claude-opus-4-6"],
        },
      },
    } as any

    //#when
    const result = getFallbackModelsForSession("ses_runtime_fallback_unknown", undefined, pluginConfig)

    //#then
    expect(result).toEqual([])
  })

  test("returns the rich fallback entry for the selected runtime fallback model", () => {
    //#given
    const sessionID = "ses_runtime_fallback_rich"
    const pluginConfig = {
      agents: {
        oracle: {
          fallback_models: [
            {
              model: "openai/gpt-5.4",
              variant: "high",
              reasoningEffort: "xhigh",
              temperature: 0.4,
              top_p: 0.7,
              maxTokens: 4096,
              thinking: { type: "disabled" },
            },
          ],
        },
      },
    } as any

    //#when
    const result = getSelectedFallbackEntry(
      sessionID,
      "oracle",
      pluginConfig,
      "openai/gpt-5.4(high)",
      "anthropic/claude-opus-4-6",
    )

    //#then
    expect(result).toEqual({
      providers: ["openai"],
      model: "gpt-5.4",
      variant: "high",
      reasoningEffort: "xhigh",
      temperature: 0.4,
      top_p: 0.7,
      maxTokens: 4096,
      thinking: { type: "disabled" },
    })
  })
})
