declare const require: (name: string) => any
const { describe, test, expect } = require("bun:test")
import { hasPremiumAllowance } from "./routing-policy-types"

describe("routing-policy-types", () => {
	test("rejects premium use without an escalation reason", () => {
		expect(hasPremiumAllowance({ phase: "execute", requestedTier: "deep", escalationReasons: [], allowPremiumModels: true })).toBe(false)
	})

	test("allows premium use for critical escalation reasons", () => {
		expect(hasPremiumAllowance({ phase: "decide", requestedTier: "critical", escalationReasons: ["architecture-decision"], allowPremiumModels: true })).toBe(true)
	})
})
