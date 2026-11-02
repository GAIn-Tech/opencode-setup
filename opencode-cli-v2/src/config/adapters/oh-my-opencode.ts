import type { UnifiedConfig } from '../schema';

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function toAgents(rawAgents: Record<string, unknown>): UnifiedConfig['agents'] {
  const mapped: UnifiedConfig['agents'] = {};

  for (const [name, value] of Object.entries(rawAgents)) {
    if (name === 'enabled') {
      continue;
    }

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      mapped[name] = {
        ...(value as Record<string, unknown>)
      };
    }
  }

  const enabled = rawAgents.enabled;
  if (Array.isArray(enabled)) {
    for (const entry of enabled) {
      if (typeof entry !== 'string') {
        continue;
      }

      const current = mapped[entry] ?? {};
      mapped[entry] = {
        ...current,
        enabled: true
      };
    }
  }

  return mapped;
}

function toMcpServers(rawMcp: Record<string, unknown>): UnifiedConfig['mcp']['servers'] {
  const servers: UnifiedConfig['mcp']['servers'] = {};

  for (const [name, value] of Object.entries(rawMcp)) {
    const config = asRecord(value);
    servers[name] = {
      ...config,
      enabled: typeof config.enabled === 'boolean' ? config.enabled : true
    };
  }

  return servers;
}

export function adaptOhMyOpencodeConfig(raw: unknown): Partial<UnifiedConfig> {
  const source = asRecord(raw);
  const agents = toAgents(asRecord(source.agents));
  const mcp = toMcpServers(asRecord(source.mcp));

  return {
    agents,
    mcp: {
      servers: mcp
    },
    legacy: {
      sources: ['oh-my-opencode.json'],
      raw: {
        ohMyOpencode: source
      }
    }
  };
}
