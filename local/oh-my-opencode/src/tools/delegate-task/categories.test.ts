declare const require: (name: string) => any
const { describe, test, expect } = require("bun:test")
import { resolveCategoryConfig } from "./categories"

describe("resolveCategoryConfig", () => {
	test("uses category default over inherited parent model when user did not configure model", () => {
		//#given
		const inheritedModel = "openai/gpt-5.4-preview"
		const categoryDefaultModel = "openai/gpt-5.4-mini"

		//#when
		const result = resolveCategoryConfig("quick", {
			userCategories: {},
			inheritedModel,
			systemDefaultModel: "anthropic/claude-sonnet-4-6",
		})

		//#then
		expect(result).not.toBeNull()
		expect(result?.model).toBe(categoryDefaultModel)
		expect(result?.config.model).toBe(categoryDefaultModel)
	})

	test("keeps user-configured category model ahead of inherited model", () => {
		//#given
		const inheritedModel = "openai/gpt-5.4-preview"
		const userModel = "quotio/kimi-k2.5"

		//#when
		const result = resolveCategoryConfig("quick", {
			userCategories: {
				quick: {
					model: userModel,
				},
			},
			inheritedModel,
			systemDefaultModel: "anthropic/claude-sonnet-4-6",
		})

		//#then
		expect(result).not.toBeNull()
		expect(result?.model).toBe(userModel)
		expect(result?.config.model).toBe(userModel)
	})
})
