import fs from 'fs';
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

export function readMetaAwarenessRollups() {
  const { rollupsPath } = fallbackPaths();
  if (!fs.existsSync(rollupsPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(rollupsPath, 'utf-8'));
  } catch {
    return null;
  }
}

export function readMetaAwarenessEvents(limit = 200) {
  const { eventsPath } = fallbackPaths();
  if (!fs.existsSync(eventsPath)) {
    return [];
  }
  try {
    const lines = fs.readFileSync(eventsPath, 'utf-8').split(/\r?\n/).filter(Boolean);
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
