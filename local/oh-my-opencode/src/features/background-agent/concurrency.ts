import type { BackgroundTaskConfig } from "../../config/schema"

/**
 * Queue entry with settled-flag pattern to prevent double-resolution.
 */
interface QueueEntry {
	model: string
	resolve: () => void
	rawReject: (error: Error) => void
	settled: boolean
}

export class ConcurrencyManager {
	private config?: BackgroundTaskConfig
	private providerCounts: Map<string, number> = new Map()
	private modelCounts: Map<string, number> = new Map()
	private queuesByProvider: Map<string, QueueEntry[]> = new Map()

	constructor(config?: BackgroundTaskConfig) {
		this.config = config
	}

	private getProviderKey(model: string): string {
		return model.includes("/") ? model.split("/")[0] : model
	}

	getModelConcurrencyLimit(model: string): number {
		const modelLimit = this.config?.modelConcurrency?.[model]
		if (modelLimit !== undefined) {
			return modelLimit === 0 ? Infinity : modelLimit
		}

		const defaultLimit = this.config?.defaultConcurrency
		if (defaultLimit !== undefined) {
			return defaultLimit === 0 ? Infinity : defaultLimit
		}

		return 5
	}

	getProviderConcurrencyLimit(model: string): number {
		const provider = this.getProviderKey(model)
		const providerLimit = this.config?.providerConcurrency?.[provider]
		if (providerLimit !== undefined) {
			return providerLimit === 0 ? Infinity : providerLimit
		}

		const defaultLimit = this.config?.defaultConcurrency
		if (defaultLimit !== undefined) {
			return defaultLimit === 0 ? Infinity : defaultLimit
		}

		return 5
	}

	getConcurrencyLimit(model: string): number {
		const modelLimit = this.config?.modelConcurrency?.[model]
		if (modelLimit !== undefined) {
			return modelLimit === 0 ? Infinity : modelLimit
		}

		const providerLimit = this.config?.providerConcurrency?.[this.getProviderKey(model)]
		if (providerLimit !== undefined) {
			return providerLimit === 0 ? Infinity : providerLimit
		}

		const defaultLimit = this.config?.defaultConcurrency
		if (defaultLimit !== undefined) {
			return defaultLimit === 0 ? Infinity : defaultLimit
		}

		return 5
	}

	private canAcquire(model: string): boolean {
		const modelLimit = this.getModelConcurrencyLimit(model)
		const providerLimit = this.getProviderConcurrencyLimit(model)
		const modelCount = this.modelCounts.get(model) ?? 0
		const providerCount = this.providerCounts.get(this.getProviderKey(model)) ?? 0

		return modelCount < modelLimit && providerCount < providerLimit
	}

	private incrementCounts(model: string): void {
		const provider = this.getProviderKey(model)
		this.modelCounts.set(model, (this.modelCounts.get(model) ?? 0) + 1)
		this.providerCounts.set(provider, (this.providerCounts.get(provider) ?? 0) + 1)
	}

	private decrementCounts(model: string): void {
		const provider = this.getProviderKey(model)
		const modelCount = this.modelCounts.get(model) ?? 0
		const providerCount = this.providerCounts.get(provider) ?? 0

		if (modelCount > 0) {
			this.modelCounts.set(model, modelCount - 1)
		}

		if (providerCount > 0) {
			this.providerCounts.set(provider, providerCount - 1)
		}
	}

	private drainQueue(provider: string): void {
		const queue = this.queuesByProvider.get(provider)
		if (!queue || queue.length === 0) {
			return
		}

		for (let index = 0; index < queue.length; index += 1) {
			const next = queue[index]
			if (!next || next.settled) {
				continue
			}

			if (!this.canAcquire(next.model)) {
				continue
			}

			queue.splice(index, 1)
			this.incrementCounts(next.model)
			next.resolve()
			return
		}
	}

	async acquire(model: string): Promise<void> {
		if (this.getConcurrencyLimit(model) === Infinity) {
			this.incrementCounts(model)
			return
		}

		if (this.canAcquire(model)) {
			this.incrementCounts(model)
			return
		}

		const provider = this.getProviderKey(model)
		return new Promise<void>((resolve, reject) => {
			const queue = this.queuesByProvider.get(provider) ?? []
			const entry: QueueEntry = {
				model,
				resolve: () => {
					if (entry.settled) return
					entry.settled = true
					resolve()
				},
				rawReject: reject,
				settled: false,
			}

			queue.push(entry)
			this.queuesByProvider.set(provider, queue)
		})
	}

	release(model: string): void {
		if (this.getConcurrencyLimit(model) === Infinity) {
			this.decrementCounts(model)
			return
		}

		this.decrementCounts(model)
		this.drainQueue(this.getProviderKey(model))
	}

	/**
	 * Cancel all waiting acquires for a provider bucket. Used during cleanup.
	 */
	cancelWaiters(model: string): void {
		const provider = this.getProviderKey(model)
		const queue = this.queuesByProvider.get(provider)
		if (queue) {
			for (const entry of queue) {
				if (!entry.settled) {
					entry.settled = true
					entry.rawReject(new Error(`Concurrency queue cancelled for provider: ${provider}`))
				}
			}
			this.queuesByProvider.delete(provider)
		}
	}

	/**
	 * Clear all state. Used during manager cleanup/shutdown.
	 * Cancels all pending waiters.
	 */
	clear(): void {
		for (const [provider] of this.queuesByProvider) {
			this.cancelWaiters(provider)
		}
		this.providerCounts.clear()
		this.modelCounts.clear()
		this.queuesByProvider.clear()
	}

	/**
	 * Get current count for a model (for testing/debugging)
	 */
	getCount(model: string): number {
		return this.modelCounts.get(model) ?? 0
	}

	getProviderCount(provider: string): number {
		return this.providerCounts.get(provider) ?? 0
	}

	/**
	 * Get queue length for a provider bucket (for testing/debugging)
	 */
	getQueueLength(model: string): number {
		return this.queuesByProvider.get(this.getProviderKey(model))?.length ?? 0
	}
}
