import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fsPromises.mkdir(dir, { recursive: true });

  const serialized = JSON.stringify(value, null, 2);
  const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;

  await fsPromises.writeFile(tempPath, serialized, 'utf-8');
  try {
    const verifyData = await fsPromises.readFile(tempPath, 'utf-8');
    JSON.parse(verifyData);
  } catch (error) {
    await fsPromises.rm(tempPath, { force: true });
    throw new Error(`Atomic write verification failed for ${filePath}: ${String(error)}`);
  }

  await fsPromises.rename(tempPath, filePath);
}
