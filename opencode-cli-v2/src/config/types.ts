export type ConfigValue =
  | string
  | number
  | boolean
  | null
  | ConfigValue[]
  | {
      readonly [key: string]: ConfigValue;
    };

export type ConfigRecord = Readonly<Record<string, ConfigValue>>;

export interface ConfigLoadSources {
  readonly defaults: boolean;
  readonly globalPath?: string;
  readonly projectPath?: string;
  readonly legacyPaths: readonly string[];
}
