import fs from 'fs';
import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

type MetaAwarenessTrackerCtor = new (options?: Record<string, unknown>) => MetaAwarenessTrackerLike;

interface MetaAwarenessTrackerModule {
  MetaAwarenessTracker?: MetaAwarenessTrackerCtor;
  default?: MetaAwarenessTrackerCtor;
}

export interface MetaAwarenessTrackerLike {
  getOverview: () => Promise<Record<string, unknown>>;
  getTimeline: (params?: { sinceDays?: number }) => Promise<unknown[]>;
  getCorrelation: (params?: { sinceDays?: number }) => Promise<Record<string, unknown>>;
  getStability: () => Promise<Record<string, unknown>>;
  getForensics: (params?: { sessionId?: string; limit?: number }) => Promise<Record<string, unknown>>;
}

export type MetaAwarenessStatusReason =
  | 'live_ready'
  | 'feature_flag_disabled'
  | 'central_config_missing'
  | 'central_config_invalid'
  | 'tracker_module_load_failed'
  | 'tracker_init_failed';

export interface MetaAwarenessTrackerLoadStatus {
  tracker: MetaAwarenessTrackerLike | null;
  statusReason: MetaAwarenessStatusReason;
  telemetryQualityMode: string;
  metaAwarenessLiveEnabled: boolean;
}

interface TelemetryFlags {
  qualityMode: string;
  metaAwarenessLiveEnabled: boolean;
  statusReason?: Extract<MetaAwarenessStatusReason, 'central_config_missing' | 'central_config_invalid'>;
}

let trackerSingleton: MetaAwarenessTrackerLike | null = null;
let trackerCtor: MetaAwarenessTrackerCtor | null = null;
let trackerModuleFailed = false;

function resolveCentralConfigPath(): string | null {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'opencode-config', 'central-config.json'),
    path.resolve(cwd, '..', 'opencode-config', 'central-config.json'),
    path.resolve(cwd, '..', '..', 'opencode-config', 'central-config.json'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function readTelemetryFlags(): TelemetryFlags {
  const defaults: TelemetryFlags = {
    qualityMode: 'off',
    metaAwarenessLiveEnabled: false,
  };

  const centralConfigPath = resolveCentralConfigPath();
  if (!centralConfigPath) {
    return {
      ...defaults,
      statusReason: 'central_config_missing',
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(centralConfigPath, 'utf-8')) as {
      sections?: {
        telemetry?: {
          quality_mode?: { value?: unknown };
          meta_awareness_live_enabled?: { value?: unknown };
        };
      };
    };

    const telemetry = parsed.sections?.telemetry;
    if (!telemetry || typeof telemetry !== 'object') {
      return {
        ...defaults,
        statusReason: 'central_config_invalid',
      };
    }

    const qualityMode = typeof telemetry.quality_mode?.value === 'string'
      ? telemetry.quality_mode.value
      : defaults.qualityMode;

    const metaAwarenessLiveEnabled = typeof telemetry.meta_awareness_live_enabled?.value === 'boolean'
      ? telemetry.meta_awareness_live_enabled.value
      : defaults.metaAwarenessLiveEnabled;

    return {
      qualityMode,
      metaAwarenessLiveEnabled,
    };
  } catch {
    return {
      ...defaults,
      statusReason: 'central_config_invalid',
    };
  }
}

function resolveTrackerModulePathCandidates(): string[] {
  const cwd = process.cwd();
  return [
    path.join(cwd, 'packages', 'opencode-learning-engine', 'src', 'meta-awareness-tracker.js'),
    path.resolve(cwd, '..', 'opencode-learning-engine', 'src', 'meta-awareness-tracker.js'),
    path.resolve(cwd, '..', '..', 'packages', 'opencode-learning-engine', 'src', 'meta-awareness-tracker.js'),
  ];
}

function extractTrackerCtor(moduleValue: unknown): MetaAwarenessTrackerCtor | null {
  const module = moduleValue as MetaAwarenessTrackerModule;
  const candidate = module?.MetaAwarenessTracker ?? module?.default;
  return typeof candidate === 'function' ? candidate : null;
}

async function resolveTrackerCtor(): Promise<MetaAwarenessTrackerCtor | null> {
  if (trackerCtor) return trackerCtor;
  if (trackerModuleFailed) return null;

  const pathCandidates = resolveTrackerModulePathCandidates();
  for (const candidatePath of pathCandidates) {
    if (!fs.existsSync(candidatePath)) continue;
    try {
      const loaded = await import(/* webpackIgnore: true */ pathToFileURL(candidatePath).href);
      const candidate = extractTrackerCtor(loaded);
      if (candidate) {
        trackerCtor = candidate;
        return trackerCtor;
      }
    } catch {
      // try next candidate
    }
  }

  trackerModuleFailed = true;
  return null;
}

function fallbackPaths() {
  const telemetryDir = path.join(os.homedir(), '.opencode', 'telemetry');
  return {
    telemetryDir,
    eventsPath: path.join(telemetryDir, 'orchestration-intel.jsonl'),
    rollupsPath: path.join(telemetryDir, 'orchestration-intel-rollups.json'),
  };
}

export async function loadMetaAwarenessTrackerWithStatus(): Promise<MetaAwarenessTrackerLoadStatus> {
  const telemetryFlags = readTelemetryFlags();

  if (!telemetryFlags.metaAwarenessLiveEnabled) {
    return {
      tracker: null,
      statusReason: telemetryFlags.statusReason ?? 'feature_flag_disabled',
      telemetryQualityMode: telemetryFlags.qualityMode,
      metaAwarenessLiveEnabled: telemetryFlags.metaAwarenessLiveEnabled,
    };
  }

  if (trackerSingleton) {
    return {
      tracker: trackerSingleton,
      statusReason: 'live_ready',
      telemetryQualityMode: telemetryFlags.qualityMode,
      metaAwarenessLiveEnabled: telemetryFlags.metaAwarenessLiveEnabled,
    };
  }

  const ctor = await resolveTrackerCtor();
  if (!ctor) {
    return {
      tracker: null,
      statusReason: 'tracker_module_load_failed',
      telemetryQualityMode: telemetryFlags.qualityMode,
      metaAwarenessLiveEnabled: telemetryFlags.metaAwarenessLiveEnabled,
    };
  }

  try {
    trackerSingleton = new ctor();
    return {
      tracker: trackerSingleton,
      statusReason: 'live_ready',
      telemetryQualityMode: telemetryFlags.qualityMode,
      metaAwarenessLiveEnabled: telemetryFlags.metaAwarenessLiveEnabled,
    };
  } catch {
    return {
      tracker: null,
      statusReason: 'tracker_init_failed',
      telemetryQualityMode: telemetryFlags.qualityMode,
      metaAwarenessLiveEnabled: telemetryFlags.metaAwarenessLiveEnabled,
    };
  }
}

export async function loadMetaAwarenessTracker(): Promise<MetaAwarenessTrackerLike | null> {
  const status = await loadMetaAwarenessTrackerWithStatus();
  return status.tracker;
}

export async function readMetaAwarenessRollups() {
  const { rollupsPath } = fallbackPaths();
  try {
    const content = await fsPromises.readFile(rollupsPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export async function readMetaAwarenessEvents(limit = 200) {
  const { eventsPath } = fallbackPaths();
  try {
    const content = await fsPromises.readFile(eventsPath, 'utf-8');
    const lines = content.split(/\r?\n/).filter(Boolean);
    return lines.slice(-Math.max(1, Math.min(limit, 2000))).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}
