import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';

function fallbackPaths() {
  const telemetryDir = path.join(os.homedir(), '.opencode', 'telemetry');
  return {
    telemetryDir,
    eventsPath: path.join(telemetryDir, 'orchestration-intel.jsonl'),
    rollupsPath: path.join(telemetryDir, 'orchestration-intel-rollups.json'),
  };
}

export function loadMetaAwarenessTracker(): any | null {
  return null;
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
