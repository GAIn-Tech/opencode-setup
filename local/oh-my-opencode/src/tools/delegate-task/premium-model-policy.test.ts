declare const require: (name: string) => any
const { describe, test, expect } = require("bun:test")
import { isPremiumDelegationModel, canUsePremiumDelegationModel } from "./premium-model-policy"

describe("premium-model-policy", () => {
	test("detects current premium models", () => {
		expect(isPremiumDelegationModel("openai/gpt-5.5")).toBe(true)
		expect(isPremiumDelegationModel("openai/gpt-5.4", "high")).toBe(true)
		expect(isPremiumDelegationModel("google/gemini-3.1-pro", "high")).toBe(true)
	})

	test("keeps non-premium models available", () => {
		expect(isPremiumDelegationModel("openai/gpt-5.4-mini")).toBe(false)
		expect(isPremiumDelegationModel("google/gemini-3-flash-preview")).toBe(false)
	})

	test("requires an escalation reason for premium use", () => {
		expect(canUsePremiumDelegationModel("openai/gpt-5.5", { phase: "execute", requestedTier: "deep", escalationReasons: [], allowPremiumModels: true })).toBe(false)
		expect(canUsePremiumDelegationModel("openai/gpt-5.5", { phase: "decide", requestedTier: "critical", escalationReasons: ["architecture-decision"], allowPremiumModels: true })).toBe(true)
	})
})
