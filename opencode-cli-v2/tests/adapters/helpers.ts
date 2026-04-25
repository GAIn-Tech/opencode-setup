import { expect } from 'bun:test';

import { PackageAdapter } from '../../src/adapters/base';
import type { AdapterHealthInput } from '../../src/adapters/health';

interface TestPort {
  readonly adapterName: string;
}

export interface TestAdapterOptions {
  readonly required?: boolean;
  readonly version?: string;
  readonly load?: () => Promise<void> | void;
  readonly initialize?: () => Promise<void> | void;
  readonly healthCheck?: () => Promise<AdapterHealthInput> | AdapterHealthInput;
  readonly shutdown?: () => Promise<void> | void;
}

export class TestAdapter extends PackageAdapter<TestPort> {
  public readonly version: string;
  public readonly portType = Symbol.for('test-port');
  public readonly required: boolean;

  public constructor(
    public readonly name: string,
    private readonly options: TestAdapterOptions = {}
  ) {
    super();
    this.version = options.version ?? '1.0.0';
    this.required = options.required ?? true;
  }

  public async load(): Promise<void> {
    await this.options.load?.();
  }

  public async initialize(): Promise<void> {
    await this.options.initialize?.();
    this.setPort({
      adapterName: this.name
    });
  }

  public async healthCheck(): Promise<AdapterHealthInput> {
    return (await this.options.healthCheck?.()) ?? 'healthy';
  }

  public async shutdown(): Promise<void> {
    await this.options.shutdown?.();
  }
}

export async function expectRejectedWith(
  candidate: Promise<unknown>,
  expectedType: abstract new (...args: never[]) => object
): Promise<void> {
  try {
    await candidate;
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(expectedType);

    return;
  }

  throw new Error('Expected promise to reject');
}
