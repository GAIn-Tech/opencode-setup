import { SQLiteReader } from './sqlite-reader';
import { join } from 'path';
import { existsSync } from 'fs';

export function getDataSource() {
  const dbPath = process.env.SISYPHUS_DB_PATH || 
    join(process.env.HOME || process.env.USERPROFILE || '', '.opencode', 'sisyphus-state.db');
  
  if (!existsSync(dbPath)) {
    console.warn(`[Dashboard] Database not found at ${dbPath}. Dashboard might be empty.`);
    // Return a mock or handle gracefully
  }

  return new SQLiteReader(dbPath);
}
