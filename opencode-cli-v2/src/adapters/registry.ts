import type { PackageAdapter } from './base';
import { AdapterRegistrationError } from './errors';

/**
 * Adapter discovery result contract.
 */
export interface AdapterDiscoveryResult {
  readonly discovered: number;
  readonly registered: number;
}

/**
 * Adapter registry (required/optional classification and lookups).
 */
export class AdapterRegistry {
  private readonly adapters = new Map<string, PackageAdapter<unknown>>();

  public register<T>(adapter: PackageAdapter<T>, options: { readonly overwrite?: boolean } = {}): void {
    const existing = this.adapters.get(adapter.name);

    if (existing && !options.overwrite) {
      throw new AdapterRegistrationError(`Adapter "${adapter.name}" is already registered`);
    }

    this.adapters.set(adapter.name, adapter);
  }

  public registerMany(adapters: readonly PackageAdapter<unknown>[]): void {
    for (const adapter of adapters) {
      this.register(adapter);
    }
  }

  public async discover(
    provider:
      | (() => readonly PackageAdapter<unknown>[] | Promise<readonly PackageAdapter<unknown>[]>)
      | readonly PackageAdapter<unknown>[]
  ): Promise<AdapterDiscoveryResult> {
    const discoveredAdapters =
      typeof provider === 'function' ? await provider() : provider;
    let registered = 0;

    for (const adapter of discoveredAdapters) {
      this.register(adapter);
      registered += 1;
    }

    return {
      discovered: discoveredAdapters.length,
      registered
    };
  }

  public unregister(name: string): boolean {
    return this.adapters.delete(name);
  }

  public clear(): void {
    this.adapters.clear();
  }

  public has(name: string): boolean {
    return this.adapters.has(name);
  }

  public get<T>(name: string): PackageAdapter<T> | undefined {
    return this.adapters.get(name) as PackageAdapter<T> | undefined;
  }

  public list(): readonly PackageAdapter<unknown>[] {
    return [...this.adapters.values()];
  }

  public getRequiredAdapters(): readonly PackageAdapter<unknown>[] {
    return this.list().filter((adapter) => adapter.required);
  }

  public getOptionalAdapters(): readonly PackageAdapter<unknown>[] {
    return this.list().filter((adapter) => !adapter.required);
  }

  public size(): number {
    return this.adapters.size;
  }
}
