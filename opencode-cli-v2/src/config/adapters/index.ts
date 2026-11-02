import type { UnifiedConfig } from '../schema';
import { adaptAntigravityConfig } from './antigravity';
import { adaptCompoundEngineeringConfig } from './compound-engineering';
import { adaptLegacyConfigYaml } from './config-yaml';
import { adaptOhMyOpencodeConfig } from './oh-my-opencode';
import { adaptOpencodeConfigJson } from './opencode-config-json';
import { adaptOpencodeJson } from './opencode-json';

export type LegacyConfigFormat =
  | 'opencode.json'
  | 'antigravity.json'
  | 'oh-my-opencode.json'
  | 'compound-engineering.json'
  | 'config.yaml'
  | '.opencode.config.json';

export type LegacyAdapter = (raw: unknown) => Partial<UnifiedConfig>;

export const LEGACY_FILENAMES: readonly LegacyConfigFormat[] = [
  'opencode.json',
  'antigravity.json',
  'oh-my-opencode.json',
  'compound-engineering.json',
  'config.yaml',
  '.opencode.config.json'
];

const adapters: Readonly<Record<LegacyConfigFormat, LegacyAdapter>> = {
  'opencode.json': adaptOpencodeJson,
  'antigravity.json': adaptAntigravityConfig,
  'oh-my-opencode.json': adaptOhMyOpencodeConfig,
  'compound-engineering.json': adaptCompoundEngineeringConfig,
  'config.yaml': adaptLegacyConfigYaml,
  '.opencode.config.json': adaptOpencodeConfigJson
};

export function getLegacyAdapter(format: LegacyConfigFormat): LegacyAdapter {
  return adapters[format];
}

export {
  adaptAntigravityConfig,
  adaptCompoundEngineeringConfig,
  adaptLegacyConfigYaml,
  adaptOhMyOpencodeConfig,
  adaptOpencodeConfigJson,
  adaptOpencodeJson
};
