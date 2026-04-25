import { describe, expect, it, beforeEach } from "bun:test"
import {
  setSessionModel,
  getSessionModel,
  clearSessionModel,
  updateSessionModel,
} from "../../shared/session-model-state"
import { _resetForTesting } from "./state"
import { createModelPersistenceHook } from "../../hooks/model-persistence"

describe("Session Model Persistence", () => {
  beforeEach(() => {
    _resetForTesting()
  })

  describe("setSessionModel", () => {
    it("should store model for a session", () => {
      const sessionID = "test-session-1"
      const model = { providerID: "zhipu", modelID: "glm-5", variant: "standard" }

      setSessionModel(sessionID, model)
      const retrieved = getSessionModel(sessionID)

      expect(retrieved).toEqual(model)
    })

    it("should overwrite existing model for same session", () => {
      const sessionID = "test-session-1"
      const model1 = { providerID: "openai", modelID: "gpt-4" }
      const model2 = { providerID: "zhipu", modelID: "glm-5" }

      setSessionModel(sessionID, model1)
      setSessionModel(sessionID, model2)
      const retrieved = getSessionModel(sessionID)

      expect(retrieved).toEqual(model2)
    })
  })

  describe("getSessionModel", () => {
    it("should return undefined for non-existent session", () => {
      const retrieved = getSessionModel("non-existent-session")
      expect(retrieved).toBeUndefined()
    })

    it("should return correct model for existing session", () => {
      const sessionID = "test-session-1"
      const model = { providerID: "anthropic", modelID: "claude-3-opus" }

      setSessionModel(sessionID, model)
      const retrieved = getSessionModel(sessionID)

      expect(retrieved?.providerID).toBe("anthropic")
      expect(retrieved?.modelID).toBe("claude-3-opus")
    })
  })

  describe("updateSessionModel", () => {
    it("should update model for existing session", () => {
      const sessionID = "test-session-1"
      const initialModel = { providerID: "openai", modelID: "gpt-4" }
      const updatedModel = { providerID: "zhipu", modelID: "glm-5", variant: "pro" }

      setSessionModel(sessionID, initialModel)
      updateSessionModel(sessionID, updatedModel)
      const retrieved = getSessionModel(sessionID)

      expect(retrieved).toEqual(updatedModel)
    })
  })

  describe("clearSessionModel", () => {
    it("should remove model for session", () => {
      const sessionID = "test-session-1"
      const model = { providerID: "zhipu", modelID: "glm-5" }

      setSessionModel(sessionID, model)
      clearSessionModel(sessionID)
      const retrieved = getSessionModel(sessionID)

      expect(retrieved).toBeUndefined()
    })

    it("should not throw for non-existent session", () => {
      expect(() => clearSessionModel("non-existent-session")).not.toThrow()
    })
  })

  describe("Auto-continuation scenario", () => {
    it("should persist model across multiple continuation cycles", () => {
      const sessionID = "continuation-session"
      const glmModel = { providerID: "zhipu", modelID: "glm-5", variant: "standard" }

      // Simulate: User selects GLM-5 model
      setSessionModel(sessionID, glmModel)

      // Simulate: First auto-continuation - model should be retrieved
      const modelAfterFirstContinuation = getSessionModel(sessionID)
      expect(modelAfterFirstContinuation?.modelID).toBe("glm-5")

      // Simulate: Second auto-continuation - model should still be retrieved
      const modelAfterSecondContinuation = getSessionModel(sessionID)
      expect(modelAfterSecondContinuation?.modelID).toBe("glm-5")

      // Simulate: Session ends - model should be cleared
      clearSessionModel(sessionID)
      const modelAfterClear = getSessionModel(sessionID)
      expect(modelAfterClear).toBeUndefined()
    })

    it("should handle multiple sessions independently", () => {
      const session1 = "session-1"
      const session2 = "session-2"

      const model1 = { providerID: "zhipu", modelID: "glm-5" }
      const model2 = { providerID: "openai", modelID: "gpt-4" }

      setSessionModel(session1, model1)
      setSessionModel(session2, model2)

      expect(getSessionModel(session1)?.modelID).toBe("glm-5")
      expect(getSessionModel(session2)?.modelID).toBe("gpt-4")

      // Clear session1, session2 should still have its model
      clearSessionModel(session1)
      expect(getSessionModel(session1)).toBeUndefined()
      expect(getSessionModel(session2)?.modelID).toBe("gpt-4")
    })
  })

describe("Edge cases", () => {
  it("should handle model with all fields", () => {
    const sessionID = "test-session"
    const model = {
      providerID: "zhipu",
      modelID: "glm-5",
      variant: "pro"
    }

    setSessionModel(sessionID, model)
    const retrieved = getSessionModel(sessionID)

    expect(retrieved?.providerID).toBe("zhipu")
    expect(retrieved?.modelID).toBe("glm-5")
    expect(retrieved?.variant).toBe("pro")
  })

  it("should handle model without variant", () => {
    const sessionID = "test-session"
    const model = {
      providerID: "openai",
      modelID: "gpt-4"
    }

    setSessionModel(sessionID, model)
    const retrieved = getSessionModel(sessionID)

    expect(retrieved?.providerID).toBe("openai")
    expect(retrieved?.modelID).toBe("gpt-4")
    expect(retrieved?.variant).toBeUndefined()
  })
})

describe("Model persistence from messages", () => {
  it("should not persist model from tool message without agent field", async () => {
    // given
    const sessionID = "test-session-tool"
    const model = { providerID: "zhipu", modelID: "glm-5", variant: "standard" }
    const hook = createModelPersistenceHook()

    // when - simulate tool message (no agent field)
    await hook["chat.message"]({ sessionID, model }, {})

    // then - model should NOT be persisted
    const retrieved = getSessionModel(sessionID)
    expect(retrieved).toBeUndefined()
  })

  it("should not overwrite existing model from tool message", async () => {
    // given
    const sessionID = "test-session-existing"
    const existingModel = { providerID: "openai", modelID: "gpt-4" }
    const toolModel = { providerID: "zhipu", modelID: "glm-5", variant: "standard" }

    // Set existing model
    setSessionModel(sessionID, existingModel)

    const hook = createModelPersistenceHook()

    // when - simulate tool message (no agent field) with different model
    await hook["chat.message"]({ sessionID, model: toolModel }, {})

    // then - existing model should NOT be overwritten
    const retrieved = getSessionModel(sessionID)
    expect(retrieved?.providerID).toBe("openai")
    expect(retrieved?.modelID).toBe("gpt-4")
  })

  it("should persist model from user message with agent field", async () => {
    // given
    const sessionID = "test-session-user"
    const model = { providerID: "zhipu", modelID: "glm-5", variant: "standard" }
    const hook = createModelPersistenceHook()

    // when - simulate user message (with agent field)
    await hook["chat.message"]({ sessionID, model, agent: "user" }, {})

    // then - model should be persisted
    const retrieved = getSessionModel(sessionID)
    expect(retrieved).toEqual(model)
  })
})
})
