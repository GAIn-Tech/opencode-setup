import type { BackgroundTask, BackgroundTaskStatus } from "./types"

const ACTIVE_STATUSES: BackgroundTaskStatus[] = ["pending", "running"]

export function getTaskProviderID(task: BackgroundTask): string | undefined {
	const model = task.model
	if (!model) return undefined
	return model.providerID
}

export function buildSiblingProviderUsage(tasks: BackgroundTask[], excludeTaskID?: string): Map<string, number> {
	const usage = new Map<string, number>()
	for (const task of tasks) {
		if (excludeTaskID && task.id === excludeTaskID) continue
		if (!task.status || !ACTIVE_STATUSES.includes(task.status)) continue
		const providerID = getTaskProviderID(task)
		if (!providerID) continue
		usage.set(providerID, (usage.get(providerID) ?? 0) + 1)
	}
	return usage
}
