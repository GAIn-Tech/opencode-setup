import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import skillRLManagerModule from '../../../../../opencode-skill-rl-manager/src/index.js';

const OPENCODE_DIRNAME = '.opencode';
const { SkillRLManager } = skillRLManagerModule as { SkillRLManager: new (options?: Record<string, unknown>) => unknown };

export function resolveDataHome(): string {
  if (process.env.OPENCODE_DATA_HOME) return process.env.OPENCODE_DATA_HOME;
  if (process.env.XDG_DATA_HOME) return path.join(process.env.XDG_DATA_HOME, 'opencode');
  const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(homeDir, OPENCODE_DIRNAME);
}

export function resolveSkillRLPath(): string {
  return path.join(resolveDataHome(), 'skill-rl.json');
}

export async function ensureSkillRLState(): Promise<Record<string, unknown> | null> {
  const skillRLPath = resolveSkillRLPath();

  const tryRead = async () => {
    try {
      const raw = await fsPromises.readFile(skillRLPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.skillBank) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // handled below
    }
    return null;
  };

  const existing = await tryRead();
  if (existing) return existing;

  try {
    new SkillRLManager({ persistencePath: skillRLPath, autoLoad: false });
    return await tryRead();
  } catch {
    return null;
  }
}

export function getSkillRLFidelity(state: Record<string, unknown> | null): 'seeded' | 'live' | 'degraded' | 'unavailable' {
  if (!state) return 'unavailable';
  if (typeof state.data_fidelity === 'string') {
    if (state.data_fidelity === 'seeded' || state.data_fidelity === 'live' || state.data_fidelity === 'degraded' || state.data_fidelity === 'unavailable') {
      return state.data_fidelity;
    }
  }
  const metadata = state.metadata;
  if (metadata && typeof metadata === 'object' && (metadata as Record<string, unknown>).is_seeded) {
    return 'seeded';
  }
  return 'live';
}
