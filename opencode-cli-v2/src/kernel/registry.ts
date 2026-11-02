import { z } from 'zod';

import { OPTIONAL_CAPABILITIES, REQUIRED_CAPABILITIES } from './types';
import type { CapabilityName, OptionalCapabilityName, RequiredCapabilityName } from './types';

const requiredCapabilitySchema = z.enum(REQUIRED_CAPABILITIES);
const optionalCapabilitySchema = z.enum(OPTIONAL_CAPABILITIES);

const registryConfigSchema = z
  .object({
    required: z.array(requiredCapabilitySchema).min(1),
    optional: z.array(optionalCapabilitySchema)
  })
  .superRefine((value, context) => {
    if (new Set(value.required).size !== value.required.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Required capabilities must be unique'
      });
    }

    if (new Set(value.optional).size !== value.optional.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Optional capabilities must be unique'
      });
    }
  });

/**
 * Runtime registry configuration.
 */
export interface CapabilityRegistryConfig {
  readonly required?: readonly RequiredCapabilityName[];
  readonly optional?: readonly OptionalCapabilityName[];
}

/**
 * Capability classification registry (required vs optional).
 */
export class CapabilityRegistry {
  private readonly requiredCapabilities: readonly RequiredCapabilityName[];
  private readonly optionalCapabilities: readonly OptionalCapabilityName[];

  public constructor(config: CapabilityRegistryConfig = {}) {
    const parsed = registryConfigSchema.parse({
      required: config.required ?? REQUIRED_CAPABILITIES,
      optional: config.optional ?? OPTIONAL_CAPABILITIES
    });

    this.requiredCapabilities = [...parsed.required];
    this.optionalCapabilities = [...parsed.optional];
  }

  public getRequiredCapabilities(): readonly RequiredCapabilityName[] {
    return this.requiredCapabilities;
  }

  public getOptionalCapabilities(): readonly OptionalCapabilityName[] {
    return this.optionalCapabilities;
  }

  public getAllCapabilities(): readonly CapabilityName[] {
    return [...this.requiredCapabilities, ...this.optionalCapabilities];
  }

  public isRequired(capability: CapabilityName): capability is RequiredCapabilityName {
    return this.requiredCapabilities.includes(capability as RequiredCapabilityName);
  }

  public isOptional(capability: CapabilityName): capability is OptionalCapabilityName {
    return this.optionalCapabilities.includes(capability as OptionalCapabilityName);
  }
}

/**
 * Creates the default registry used by the kernel composition root.
 */
export function createDefaultCapabilityRegistry(): CapabilityRegistry {
  return new CapabilityRegistry();
}
