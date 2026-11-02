declare const require: (name: string) => any
const { describe, test, expect } = require("bun:test")
import { buildRoutingPolicyContext } from "./routing-context"

describe("routing-context", () => {
	test("marks oracle as a critical decision agent", () => {
		const policy = buildRoutingPolicyContext({ agent: "oracle" })
		expect(policy.phase).toBe("decide")
		expect(policy.allowPremiumModels).toBe(true)
		expect(policy.escalationReasons).toContain("architecture-decision")
	})

	test("keeps deep tasks off premium by default", () => {
		const policy = buildRoutingPolicyContext({ category: "deep" })
		expect(policy.phase).toBe("execute")
		expect(policy.allowPremiumModels).toBe(false)
	})
})
