declare const require: (name: string) => any
const { describe, test, expect } = require("bun:test")
import { buildProviderCandidates, choosePreferredProviderCandidate } from "./provider-staggering"

describe("provider-staggering", () => {
	test("prefers the least-used provider among candidates", () => {
		const candidates = buildProviderCandidates("openai/gpt-5.5", [
			{ providers: ["openai"], model: "gpt-5.4" },
			{ providers: ["google"], model: "gemini-3.1-pro" },
		])
		const preferred = choosePreferredProviderCandidate(candidates, new Map([["openai", 2], ["google", 0]]))
		expect(preferred?.providerID).toBe("google")
	})

	test("keeps current model when sibling usage is tied", () => {
		const candidates = buildProviderCandidates("openai/gpt-5.5", [
			{ providers: ["google"], model: "gemini-3.1-pro" },
		])
		const preferred = choosePreferredProviderCandidate(candidates, new Map())
		expect(preferred?.providerID).toBe("openai")
	})
})
