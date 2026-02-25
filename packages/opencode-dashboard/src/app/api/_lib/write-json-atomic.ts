import fs from 'fs';
import path from 'path';

export function writeJsonAtomic(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const serialized = JSON.stringify(value, null, 2);
  const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;

  fs.writeFileSync(tempPath, serialized, 'utf-8');
  try {
    JSON.parse(fs.readFileSync(tempPath, 'utf-8'));
  } catch (error) {
    fs.rmSync(tempPath, { force: true });
    throw new Error(`Atomic write verification failed for ${filePath}: ${String(error)}`);
  }

  fs.renameSync(tempPath, filePath);
}
