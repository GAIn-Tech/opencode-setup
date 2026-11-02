import type { DelegatedModelConfig } from "./types"
import { parseModelString } from "./model-string-parser"
import type { RoutingPolicyContext } from "./routing-policy-types"

const PREMIUM_MODEL_PATTERNS = [
	{ providerID: "openai", modelID: "gpt-5.5" },
	{ providerID: "openai", modelID: "gpt-5.4", premiumVariants: new Set(["high", "xhigh", "max"]) },
	{ providerID: "google", modelID: "gemini-3.1-pro", premiumVariants: new Set(["high", "xhigh", "max"]) },
	{ providerID: "anthropic", modelID: "claude-opus" },
]

function matchesPattern(providerID: string, modelID: string, variant: string | undefined): boolean {
	for (const pattern of PREMIUM_MODEL_PATTERNS) {
		if (providerID !== pattern.providerID) continue
		if (!modelID.startsWith(pattern.modelID)) continue
		if (pattern.premiumVariants && !pattern.premiumVariants.has(variant ?? "")) continue
		return true
	}

	return false
}

export function isPremiumDelegationModel(model: string | DelegatedModelConfig | undefined, variant?: string): boolean {
	if (!model) return false

	if (typeof model !== "string") {
		return isPremiumDelegationModel(`${model.providerID}/${model.modelID}`, model.variant)
	}

	const parsed = parseModelString(model)
	if (!parsed) return false

	return matchesPattern(parsed.providerID, parsed.modelID, variant ?? parsed.variant)
}

export function canUsePremiumDelegationModel(
	model: string | DelegatedModelConfig | undefined,
	routingPolicy: RoutingPolicyContext | undefined,
): boolean {
	if (!isPremiumDelegationModel(model)) return true
	if (!routingPolicy) return true
	return routingPolicy.allowPremiumModels && routingPolicy.escalationReasons.length > 0
}
