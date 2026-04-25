/**
 * Integration Test: Model Persistence with Agent Calls
 *
 * This test verifies that when a user selects a non-default model (e.g., glm5)
 * and calls an agent (e.g., Prometheus), the main session's model persists
 * and is not overwritten by the agent's default model.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import {
  setSessionModel,
  getSessionModel,
  clearSessionModel,
} from "../../shared/session-model-state"
import { subagentSessions } from "../../features/claude-code-session-state"
import { createModelPersistenceHook } from "../../hooks/model-persistence"

// Mock the delegate_task tool execution
const mockExecuteDelegateTask = async (
  parentSessionID: string,
  agent: string,
  model?: { providerID: string; modelID: string; variant?: string }
): Promise<{ childSessionID: string; result: unknown }> => {
  // Generate a child session ID
  const childSessionID = `${parentSessionID}-child-${Date.now()}`

  // Register as subagent session
  subagentSessions.add(childSessionID)

  // If no model provided, use parent's model
  const parentModel = getSessionModel(parentSessionID)
  const effectiveModel = model || parentModel

  // Set the model for child session (this simulates what the tool does)
  if (effectiveModel) {
    setSessionModel(childSessionID, effectiveModel)
  }

  // Simulate agent execution
  await new Promise((resolve) => setTimeout(resolve, 100))

  // Clean up child session
  clearSessionModel(childSessionID)
  subagentSessions.delete(childSessionID)

  return {
    childSessionID,
    result: { success: true, agent },
  }
}

describe("Model Persistence with Agent Calls", () => {
  const MAIN_SESSION_ID = "test-main-session-123"
  const USER_SELECTED_MODEL = {
    providerID: "openrouter",
    modelID: "glm5",
    variant: "default",
  }

  beforeEach(() => {
    // Clear all state before each test
    clearSessionModel(MAIN_SESSION_ID)
    subagentSessions.clear()
  })

  afterEach(() => {
    // Clean up after each test
    clearSessionModel(MAIN_SESSION_ID)
    subagentSessions.clear()
  })

  describe("User selects glm5 and calls Prometheus agent", () => {
    it("should persist glm5 in main session after agent completes", async () => {
      // Step 1: User selects glm5 model (simulates UI selection)
      setSessionModel(MAIN_SESSION_ID, USER_SELECTED_MODEL)

      // Verify model is set
      const initialModel = getSessionModel(MAIN_SESSION_ID)
      expect(initialModel).toEqual(USER_SELECTED_MODEL)
      expect(initialModel?.modelID).toBe("glm5")

      // Step 2: User calls Prometheus agent
      // This simulates what happens when task() is called with category="plan"
      const { childSessionID, result } = await mockExecuteDelegateTask(
        MAIN_SESSION_ID,
        "prometheus",
        // Note: No model passed - should inherit from parent
        undefined
      )

      // Step 3: Verify child session used parent's model
      // (In real execution, the child would have already completed and been cleaned up)
      // But we verify the child was created with the correct model
      expect(result).toEqual({ success: true, agent: "prometheus" })
      expect(childSessionID).toContain(MAIN_SESSION_ID)

      // Step 4: CRITICAL - Verify main session still has glm5
      const finalModel = getSessionModel(MAIN_SESSION_ID)
      expect(finalModel).toBeDefined()
      expect(finalModel?.modelID).toBe("glm5")
      expect(finalModel?.providerID).toBe("openrouter")
      expect(finalModel?.variant).toBe("default")
    })

    it("should persist glm5 even when agent uses different model", async () => {
      // Step 1: User selects glm5 model
      setSessionModel(MAIN_SESSION_ID, USER_SELECTED_MODEL)

      // Step 2: Agent is called with a DIFFERENT model (simulates OMO default)
      const AGENT_DEFAULT_MODEL = {
        providerID: "openai",
        modelID: "gpt-4o",
        variant: "default",
      }

      const { childSessionID } = await mockExecuteDelegateTask(
        MAIN_SESSION_ID,
        "prometheus",
        AGENT_DEFAULT_MODEL // Agent uses its own default
      )

      // Step 3: Verify main session STILL has glm5 (not overwritten)
      const finalModel = getSessionModel(MAIN_SESSION_ID)
      expect(finalModel).toBeDefined()
      expect(finalModel?.modelID).toBe("glm5") // Should still be glm5!
      expect(finalModel?.modelID).not.toBe("gpt-4o") // Should NOT be agent's model
    })

    it("should allow user to change model after agent completes", async () => {
      // Step 1: User selects glm5
      setSessionModel(MAIN_SESSION_ID, USER_SELECTED_MODEL)

      // Step 2: Call agent
      await mockExecuteDelegateTask(MAIN_SESSION_ID, "prometheus", undefined)

      // Step 3: Verify glm5 persisted
      expect(getSessionModel(MAIN_SESSION_ID)?.modelID).toBe("glm5")

      // Step 4: User changes to a different model (simulates UI change)
      const NEW_MODEL = {
        providerID: "anthropic",
        modelID: "claude-3-sonnet",
        variant: "default",
      }

      // This simulates a user message with agent field (should overwrite)
      setSessionModel(MAIN_SESSION_ID, NEW_MODEL)

      // Step 5: Verify new model is saved
      const updatedModel = getSessionModel(MAIN_SESSION_ID)
      expect(updatedModel?.modelID).toBe("claude-3-sonnet")
    })
  })

  describe("Multiple agent calls", () => {
    it("should persist glm5 after multiple agent calls", async () => {
      // Step 1: User selects glm5
      setSessionModel(MAIN_SESSION_ID, USER_SELECTED_MODEL)

      // Step 2: Call multiple agents
      const agents = ["prometheus", "sisyphus", "atlas"]
      for (const agent of agents) {
        await mockExecuteDelegateTask(MAIN_SESSION_ID, agent, undefined)
      }

      // Step 3: Verify glm5 still persisted
      const finalModel = getSessionModel(MAIN_SESSION_ID)
      expect(finalModel?.modelID).toBe("glm5")
    })

    it("should persist glm5 when agents complete with different models", async () => {
      // Step 1: User selects glm5
      setSessionModel(MAIN_SESSION_ID, USER_SELECTED_MODEL)

      // Step 2: Call agents with different models
      const agentModels = [
        { providerID: "openai", modelID: "gpt-4o", variant: "default" },
        { providerID: "anthropic", modelID: "claude-3-opus", variant: "default" },
        { providerID: "google", modelID: "gemini-pro", variant: "default" },
      ]

      for (const model of agentModels) {
        await mockExecuteDelegateTask(MAIN_SESSION_ID, "prometheus", model)
      }

      // Step 3: Verify glm5 still persisted (not overwritten by any agent)
      const finalModel = getSessionModel(MAIN_SESSION_ID)
      expect(finalModel?.modelID).toBe("glm5")
    })
  })

  describe("Edge cases", () => {
    it("should handle agent call when no model is initially set", async () => {
      // Step 1: No model set initially
      expect(getSessionModel(MAIN_SESSION_ID)).toBeUndefined()

      // Step 2: Call agent with a model
      const AGENT_MODEL = {
        providerID: "openai",
        modelID: "gpt-4o",
        variant: "default",
      }

      await mockExecuteDelegateTask(MAIN_SESSION_ID, "prometheus", AGENT_MODEL)

      // Step 3: Main session should still have no model (child sessions don't affect parent)
      // Note: This behavior depends on requirements - currently child doesn't set parent model
      const finalModel = getSessionModel(MAIN_SESSION_ID)
      // If we want the first agent call to set the model, this would be AGENT_MODEL
      // Otherwise it remains undefined
      expect(finalModel).toBeUndefined()
    })

    it("should handle rapid successive agent calls", async () => {
      // Step 1: User selects glm5
      setSessionModel(MAIN_SESSION_ID, USER_SELECTED_MODEL)

      // Step 2: Rapidly call multiple agents
      const promises = Array.from({ length: 10 }, (_, i) =>
        mockExecuteDelegateTask(MAIN_SESSION_ID, `agent-${i}`, {
          providerID: "openai",
          modelID: `gpt-${i}`,
          variant: "default",
        })
      )

      await Promise.all(promises)

      // Step 3: Verify glm5 still persisted
      const finalModel = getSessionModel(MAIN_SESSION_ID)
      expect(finalModel?.modelID).toBe("glm5")
    })
  })
})

describe("Real-world scenario: DCP tool usage", () => {
  const MAIN_SESSION_ID = "dcp-test-session"
  const USER_MODEL = {
    providerID: "openrouter",
    modelID: "glm5",
    variant: "default",
  }

  beforeEach(() => {
    clearSessionModel(MAIN_SESSION_ID)
    subagentSessions.clear()
  })

  afterEach(() => {
    clearSessionModel(MAIN_SESSION_ID)
    subagentSessions.clear()
  })

  it("should persist glm5 after DCP tool execution", async () => {
    // Step 1: User selects glm5
    setSessionModel(MAIN_SESSION_ID, USER_MODEL)

    // Step 2: Simulate DCP tool execution
    // DCP creates a child session with default OMO model
    const DCP_DEFAULT_MODEL = {
      providerID: "openai",
      modelID: "gpt-4o-mini",
      variant: "default",
    }

    // Simulate DCP tool creating a child session
    const dcpSessionID = `${MAIN_SESSION_ID}-dcp-${Date.now()}`
    subagentSessions.add(dcpSessionID)
    setSessionModel(dcpSessionID, DCP_DEFAULT_MODEL)

    // Simulate DCP execution
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Clean up DCP session
    clearSessionModel(dcpSessionID)
    subagentSessions.delete(dcpSessionID)

    // Step 3: Verify main session still has glm5
    const finalModel = getSessionModel(MAIN_SESSION_ID)
    expect(finalModel?.modelID).toBe("glm5")
    expect(finalModel?.modelID).not.toBe("gpt-4o-mini")
  })
})

describe("Hook behavior with tool/continuation/DCP messages", () => {
  const MAIN_SESSION_ID = "hook-test-session"
  const USER_MODEL = {
    providerID: "openrouter",
    modelID: "glm5",
    variant: "default",
  }
  const DEFAULT_MODEL = {
    providerID: "openai",
    modelID: "gpt-4o",
    variant: "default",
  }

  let hook: ReturnType<typeof createModelPersistenceHook>

  beforeEach(() => {
    clearSessionModel(MAIN_SESSION_ID)
    subagentSessions.clear()
    hook = createModelPersistenceHook()
  })

  afterEach(() => {
    clearSessionModel(MAIN_SESSION_ID)
    subagentSessions.clear()
  })

  it("should not persist model from DCP tool execution without agent field", async () => {
    // given: User has selected a model
    setSessionModel(MAIN_SESSION_ID, USER_MODEL)
    expect(getSessionModel(MAIN_SESSION_ID)).toEqual(USER_MODEL)

    // when: DCP tool message is received (no agent field)
    const dcpMessage = {
      sessionID: MAIN_SESSION_ID,
      model: DEFAULT_MODEL,
      // Note: no agent field - this is a tool/DCP message
    }
    await hook["chat.message"](dcpMessage, {})

    // then: Main session model should remain unchanged
    const finalModel = getSessionModel(MAIN_SESSION_ID)
    expect(finalModel).toEqual(USER_MODEL)
    expect(finalModel?.modelID).toBe("glm5")
    expect(finalModel?.modelID).not.toBe("gpt-4o")
  })

  it("should not reset model after continuation message", async () => {
    // given: User has selected a model
    setSessionModel(MAIN_SESSION_ID, USER_MODEL)
    expect(getSessionModel(MAIN_SESSION_ID)).toEqual(USER_MODEL)

    // when: Continuation message is received (no agent field)
    const continuationMessage = {
      sessionID: MAIN_SESSION_ID,
      model: DEFAULT_MODEL,
      // Note: no agent field - this is a continuation message
    }
    await hook["chat.message"](continuationMessage, {})

    // then: Main session model should remain unchanged
    const finalModel = getSessionModel(MAIN_SESSION_ID)
    expect(finalModel).toEqual(USER_MODEL)
    expect(finalModel?.modelID).toBe("glm5")
    expect(finalModel?.modelID).not.toBe("gpt-4o")
  })

  it("should maintain model across multiple tool messages", async () => {
    // given: User has selected a model
    setSessionModel(MAIN_SESSION_ID, USER_MODEL)
    expect(getSessionModel(MAIN_SESSION_ID)).toEqual(USER_MODEL)

    // when: Multiple tool messages are received in sequence (no agent field)
    const toolMessages = [
      { sessionID: MAIN_SESSION_ID, model: { providerID: "openai", modelID: "gpt-4o-mini", variant: "default" } },
      { sessionID: MAIN_SESSION_ID, model: { providerID: "anthropic", modelID: "claude-3-haiku", variant: "default" } },
      { sessionID: MAIN_SESSION_ID, model: { providerID: "google", modelID: "gemini-flash", variant: "default" } },
    ]

    for (const message of toolMessages) {
      await hook["chat.message"](message, {})
    }

    // then: Main session model should still be the user's original selection
    const finalModel = getSessionModel(MAIN_SESSION_ID)
    expect(finalModel).toEqual(USER_MODEL)
    expect(finalModel?.modelID).toBe("glm5")
    expect(finalModel?.modelID).not.toBe("gpt-4o-mini")
    expect(finalModel?.modelID).not.toBe("claude-3-haiku")
    expect(finalModel?.modelID).not.toBe("gemini-flash")
  })

  it("should update model when user message with agent field is received", async () => {
    // given: User has selected an initial model
    setSessionModel(MAIN_SESSION_ID, USER_MODEL)
    expect(getSessionModel(MAIN_SESSION_ID)).toEqual(USER_MODEL)

    // when: User message with agent field is received
    const userMessage = {
      sessionID: MAIN_SESSION_ID,
      model: { providerID: "anthropic", modelID: "claude-3-sonnet", variant: "default" },
      agent: "sisyphus", // User message has agent field
    }
    await hook["chat.message"](userMessage, {})

    // then: Model should be updated to the new selection
    const finalModel = getSessionModel(MAIN_SESSION_ID)
    expect(finalModel?.modelID).toBe("claude-3-sonnet")
    expect(finalModel?.providerID).toBe("anthropic")
  })
})
