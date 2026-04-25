import { beforeEach, describe, expect, mock, test } from "bun:test"
import { resolveModelPipeline, resetModelPreferenceCacheForTest } from "./model-resolution-pipeline"

// Force test-runner isolation: files that import mock.module are auto-detected
// by run-ci-tests.ts and executed in their own bun process so they cannot be
// contaminated by (or contaminate) mock.module calls in other test files.
mock.module("./logger", () => ({
  log: () => {},
}))

mock.module("./user-preference", () => ({
  UserPreference: class {
    async load(): Promise<string | null> {
      return null
    }

    async save(_modelId: string): Promise<void> {}
  },
}))

describe("resolveModelPipeline", () => {
  beforeEach(() => {
    resetModelPreferenceCacheForTest()
  })

  test("does not return unused explicit user config metadata in override result", () => {
    // given
    const result = resolveModelPipeline({
      intent: {
        userModel: "openai/gpt-5.3-codex",
      },
      constraints: {
        availableModels: new Set<string>(),
      },
    })

    // when
    const hasExplicitUserConfigField = result
      ? Object.prototype.hasOwnProperty.call(result, "explicitUserConfig")
      : false

    // then
    expect(result).toEqual({ model: "openai/gpt-5.3-codex", provenance: "override" })
    expect(hasExplicitUserConfigField).toBe(false)
  })

  test("prefers category default over cached preferred model", () => {
    // given: persist a previous explicit override into preference cache
    resolveModelPipeline({
      intent: { uiSelectedModel: "openai/gpt-5.3-codex" },
      constraints: { availableModels: new Set<string>() },
    })

    // when: resolving with an explicit category default
    const result = resolveModelPipeline({
      intent: {
        categoryDefaultModel: "nvidia/z-ai/glm-5.1",
      },
      constraints: {
        availableModels: new Set<string>(),
      },
    })

    // then
    expect(result).toEqual({ model: "nvidia/z-ai/glm-5.1", provenance: "category-default", attempted: ["nvidia/z-ai/glm-5.1"] })
  })

  test("does not persist fallback/system resolutions as preferred model", () => {
    // given: resolve once via fallback chain
    resolveModelPipeline({
      constraints: {
        availableModels: new Set<string>(["openai/gpt-5.2"]),
      },
      policy: {
        fallbackChain: [{ model: "gpt-5.2", providers: ["openai"] }],
      },
    })

    // when: no explicit/category/fallback, system default should be used
    const result = resolveModelPipeline({
      constraints: {
        availableModels: new Set<string>(),
      },
      policy: {
        systemDefaultModel: "nvidia/z-ai/glm-5.1",
      },
    })

    // then: previous fallback was not sticky-preferred
    expect(result).toEqual({
      model: "nvidia/z-ai/glm-5.1",
      provenance: "system-default",
      attempted: [],
    })
  })
})
