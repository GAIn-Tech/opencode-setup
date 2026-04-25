import type { DelegationPhase, EscalationReason, ModelPowerTier, RoutingPolicyContext } from "./routing-policy-types"

const CRITICAL_AGENT_REASONS: Record<string, EscalationReason[]> = {
	oracle: ["architecture-decision", "conflicting-evidence"],
	metis: ["architecture-decision", "conflicting-evidence"],
	momus: ["architecture-decision", "conflicting-evidence"],
	sisyphus: ["high-blast-radius", "architecture-decision"],
	ultrabrain: ["architecture-decision"],
 	"visual-engineering": ["creative-critical"],
	artistry: ["creative-critical"],
}

const DEFAULT_POLICY: RoutingPolicyContext = {
	phase: "execute",
	requestedTier: "deep",
	escalationReasons: [],
	allowPremiumModels: false,
}

function normalizeName(name: string | undefined): string | undefined {
	return name?.trim().toLowerCase() || undefined
}

export function buildRoutingPolicyContext(input: {
	category?: string
	agent?: string
	routing?: string
	userOverride?: boolean
}): RoutingPolicyContext {
	const category = normalizeName(input.category)
	const agent = normalizeName(input.agent)
	const criticalReasons = agent ? CRITICAL_AGENT_REASONS[agent] : undefined

	if (agent && criticalReasons) {
		return {
			phase: agent === "oracle" || agent === "metis" || agent === "momus" ? "decide" : "synthesize",
			requestedTier: "critical",
			escalationReasons: input.userOverride ? ["explicit-user-override", ...criticalReasons] : criticalReasons,
			allowPremiumModels: true,
			agent,
			category,
		}
	}

	if (category === "quick" || category === "writing" || category === "explore" || category === "librarian" || category === "unspecified-low") {
		return { ...DEFAULT_POLICY, category, agent, phase: "explore", requestedTier: "mechanical" }
	}

	if (category === "deep" || category === "unspecified-high") {
		return { ...DEFAULT_POLICY, category, agent, phase: "execute", requestedTier: "deep" }
	}

	if (category === "visual-engineering" || category === "artistry") {
		return {
			phase: "synthesize",
			requestedTier: "critical",
			escalationReasons: ["creative-critical"],
			allowPremiumModels: true,
			category,
			agent,
		}
	}

	if (input.userOverride) {
		return {
			phase: "execute",
			requestedTier: "critical",
			escalationReasons: ["explicit-user-override"],
			allowPremiumModels: true,
			category,
			agent,
		}
	}

	if (input.routing === "thompson-sampling") {
		return {
			phase: "execute",
			requestedTier: "deep",
			escalationReasons: [],
			allowPremiumModels: false,
			category,
			agent,
		}
	}

	return { ...DEFAULT_POLICY, category, agent }
}
