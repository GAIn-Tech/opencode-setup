declare const require: (name: string) => any
const { describe, test, expect } = require("bun:test")
import { buildSiblingProviderUsage } from "./sibling-provider-tracker"

describe("sibling-provider-tracker", () => {
	test("counts providers from sibling tasks", () => {
		const usage = buildSiblingProviderUsage([
			{ id: "1", status: "running", queuedAt: new Date(), description: "a", prompt: "", agent: "x", model: { providerID: "openai", modelID: "gpt-5.4" } },
			{ id: "2", status: "running", queuedAt: new Date(), description: "b", prompt: "", agent: "y", model: { providerID: "openai", modelID: "gpt-5.5" } },
			{ id: "3", status: "running", queuedAt: new Date(), description: "c", prompt: "", agent: "z", model: { providerID: "google", modelID: "gemini-3.1-pro" } },
		])

		expect(usage.get("openai")).toBe(2)
		expect(usage.get("google")).toBe(1)
	})

	test("can exclude the current task from sibling counts", () => {
		const usage = buildSiblingProviderUsage([
			{ id: "1", status: "running", queuedAt: new Date(), description: "a", prompt: "", agent: "x", model: { providerID: "openai", modelID: "gpt-5.4" } },
			{ id: "2", status: "running", queuedAt: new Date(), description: "b", prompt: "", agent: "y", model: { providerID: "google", modelID: "gemini-3.1-pro" } },
		], "1")

		expect(usage.get("openai")).toBeUndefined()
		expect(usage.get("google")).toBe(1)
	})

	test("ignores completed siblings when counting provider usage", () => {
		const usage = buildSiblingProviderUsage([
			{ id: "1", status: "completed", queuedAt: new Date(), description: "a", prompt: "", agent: "x", model: { providerID: "openai", modelID: "gpt-5.4" } },
			{ id: "2", status: "running", queuedAt: new Date(), description: "b", prompt: "", agent: "y", model: { providerID: "google", modelID: "gemini-3.1-pro" } },
		])

		expect(usage.get("openai")).toBeUndefined()
		expect(usage.get("google")).toBe(1)
	})
})
