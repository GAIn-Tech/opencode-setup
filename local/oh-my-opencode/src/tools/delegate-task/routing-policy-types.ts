export type ModelPowerTier = "mechanical" | "routine" | "deep" | "critical"

export type DelegationPhase = "explore" | "execute" | "synthesize" | "decide" | "verify"

export type EscalationReason =
	| "explicit-user-override"
	| "repeated-failure"
	| "high-blast-radius"
	| "security-sensitive"
	| "architecture-decision"
	| "conflicting-evidence"
	| "critical-debugging"
	| "creative-critical"

export interface RoutingPolicyContext {
	phase: DelegationPhase
	requestedTier: ModelPowerTier
	escalationReasons: EscalationReason[]
	allowPremiumModels: boolean
	category?: string
	agent?: string
}

export const PREMIUM_ALLOWED_REASONS = new Set<EscalationReason>([
	"explicit-user-override",
	"repeated-failure",
	"high-blast-radius",
	"security-sensitive",
	"architecture-decision",
	"conflicting-evidence",
	"critical-debugging",
	"creative-critical",
])

export function hasPremiumAllowance(context: RoutingPolicyContext): boolean {
	return context.allowPremiumModels && context.escalationReasons.some((reason) => PREMIUM_ALLOWED_REASONS.has(reason))
}
