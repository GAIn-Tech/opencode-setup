import type { FallbackEntry } from "../../shared/model-requirements"
import { parseModelString } from "./model-string-parser"

export interface ProviderCandidate {
	providerID: string
	modelID: string
	variant?: string
	selectedFrom: "current" | "fallback"
	fallbackEntry?: FallbackEntry
}

function candidateKey(candidate: ProviderCandidate): string {
	return `${candidate.providerID}/${candidate.modelID}`
}

export function buildProviderCandidates(currentModel: string | undefined, fallbackChain: FallbackEntry[] | undefined): ProviderCandidate[] {
	const candidates: ProviderCandidate[] = []
	if (currentModel) {
		const parsed = parseModelString(currentModel)
		if (parsed) {
			candidates.push({
				providerID: parsed.providerID,
				modelID: parsed.modelID,
				variant: parsed.variant,
				selectedFrom: "current",
			})
		}
	}

	for (const entry of fallbackChain ?? []) {
		for (const providerID of entry.providers) {
			candidates.push({
				providerID,
				modelID: entry.model,
				variant: entry.variant,
				selectedFrom: "fallback",
				fallbackEntry: entry,
			})
		}
	}

	return candidates
}

export function rankProviderCandidates(
	candidates: ProviderCandidate[],
	siblingProviderUsage: Map<string, number>,
): ProviderCandidate[] {
	return [...candidates].sort((left, right) => {
		const leftUsage = siblingProviderUsage.get(left.providerID) ?? 0
		const rightUsage = siblingProviderUsage.get(right.providerID) ?? 0
		if (leftUsage !== rightUsage) {
			return leftUsage - rightUsage
		}

		if (left.selectedFrom !== right.selectedFrom) {
			return left.selectedFrom === "current" ? -1 : 1
		}

		return candidateKey(left).localeCompare(candidateKey(right))
	})
}

export function choosePreferredProviderCandidate(
	candidates: ProviderCandidate[],
	siblingProviderUsage: Map<string, number>,
): ProviderCandidate | undefined {
	return rankProviderCandidates(candidates, siblingProviderUsage)[0]
}
