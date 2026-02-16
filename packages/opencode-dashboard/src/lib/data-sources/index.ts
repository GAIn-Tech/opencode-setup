import { SQLiteReader } from './sqlite-reader';
import { OpencodeCliReader } from './opencode-cli-reader';
import { join } from 'path';
import { existsSync } from 'fs';

export function getDataSource() {
  const dbPath = process.env.SISYPHUS_DB_PATH ||
    process.env.SQLITE_DB_PATH ||
    join(process.env.HOME || process.env.USERPROFILE || '', '.opencode', 'sisyphus-state.db');

  if (!existsSync(dbPath)) {
    console.warn(`[Dashboard] Database not found at ${dbPath}. Falling back to opencode session CLI.`);
    return new OpencodeCliReader();
  }

  return new SQLiteReader(dbPath);
}
