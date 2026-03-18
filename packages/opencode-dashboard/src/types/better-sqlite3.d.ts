declare module 'better-sqlite3' {
  interface Database {
    prepare(sql: string): Statement;
    exec(sql: string): Database;
    close(): void;
    transaction<T>(fn: () => T): () => T;
  }

  interface Statement {
    run(...params: unknown[]): RunResult;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
    bind(...params: unknown[]): Statement;
  }

  interface RunResult {
    changes: number;
    lastInsertRowid: number;
  }

  interface DatabaseConstructor {
    new (filename: string, options?: Record<string, unknown>): Database;
  }

  const sqlite3: DatabaseConstructor;
  namespace sqlite3 {
    interface Database {
      prepare(sql: string): Statement;
      exec(sql: string): Database;
      close(): void;
      transaction<T>(fn: () => T): () => T;
    }
  }
  export = sqlite3;
}
