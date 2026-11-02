/**
 * Bun-Native SQLite Reference Patterns
 * =====================================
 * Extracted from opencode-memory-bus spike before pruning.
 * These patterns document Bun 1.3.x + bun:sqlite capabilities:
 *
 * 1. sqlite-vec loading and KNN vector queries
 * 2. FTS5 virtual tables with MATCH and bm25() scoring
 * 3. sqlite-vec + FTS5 coexistence in same database
 * 4. Transactions (commit + rollback)
 * 5. Data types (int, text, blob, null)
 *
 * Usage: Import individual patterns as needed for tests or implementations.
 * These are NOT meant to be run directly — they're reference code.
 */

import { Database } from 'bun:sqlite';

// ============================================================
// Pattern 1: sqlite-vec loading and vector KNN queries
// ============================================================
// Requires: `bun add sqlite-vec`
//
// import * as sqliteVec from 'sqlite-vec';
//
// export function createVectorDB() {
//   const db = new Database(':memory:');
//   sqliteVec.load(db);
//
//   db.exec(`
//     CREATE VIRTUAL TABLE vec_items USING vec0(
//       embedding float[384]
//     )
//   `);
//
//   return db;
// }
//
// export function insertVector(db, rowid, vector) {
//   // Key pattern: Float32Array → Buffer for sqlite-vec
//   const bytes = Buffer.from(new Float32Array(vector).buffer);
//   db.prepare('INSERT INTO vec_items(rowid, embedding) VALUES (?, ?)').run(rowid, bytes);
// }
//
// export function knnQuery(db, queryVector, limit = 5) {
//   const queryBytes = Buffer.from(new Float32Array(queryVector).buffer);
//   return db.query(
//     'SELECT rowid, distance FROM vec_items WHERE embedding MATCH ? ORDER BY distance LIMIT ?'
//   ).all(queryBytes, limit);
// }

// ============================================================
// Pattern 2: FTS5 virtual table with MATCH and bm25() scoring
// ============================================================

export function createFTS5Table(db, tableName, columns) {
  const colDef = columns.join(', ');
  db.exec(`CREATE VIRTUAL TABLE ${tableName} USING fts5(${colDef})`);
}

export function ftsSearch(db, tableName, query) {
  return db.prepare(
    `SELECT *, bm25(${tableName}) as score FROM ${tableName} WHERE ${tableName} MATCH ? ORDER BY bm25(${tableName})`
  ).all(query);
}

// ============================================================
// Pattern 3: sqlite-vec + FTS5 coexistence
// ============================================================
// Both can exist in the same database. Create FTS5 tables normally
// and vec0 tables after sqliteVec.load(db). No conflicts.

// ============================================================
// Pattern 4: Transactions with commit and rollback
// ============================================================

export function withTransaction(db, fn) {
  const transaction = db.transaction(fn);
  return transaction(); // Auto-commits on success, auto-rollbacks on throw
}

// ============================================================
// Pattern 5: Data types — integers, text, blobs, nulls
// ============================================================

export function insertBlob(db, table, column, data) {
  const blobData = Buffer.from(data);
  db.prepare(`INSERT INTO ${table} (${column}) VALUES (?)`).run(blobData);
}

// ============================================================
// Pattern 6: Multi-column FTS5 with porter tokenizer
// ============================================================

export function createPorterFTS5(db, tableName, columns) {
  const colDef = columns.join(', ');
  db.exec(`CREATE VIRTUAL TABLE ${tableName} USING fts5(${colDef}, tokenize = 'porter')`);
}

// ============================================================
// Test Reference: 12 bun:sqlite test patterns (from spike.test.js)
// ============================================================
// 1.  DB creation: new Database(':memory:')
// 2.  CRUD: CREATE TABLE, INSERT, SELECT with prepared statements
// 3.  Parameterized queries: db.prepare('...WHERE name = ?').get('Alice')
// 4.  Transaction commit: db.transaction(() => { ... })()
// 5.  Transaction rollback: transaction throws → auto-rollback
// 6.  FTS5 creation: CREATE VIRTUAL TABLE ... USING fts5(col1, col2, tokenize='porter')
// 7.  FTS5 MATCH: WHERE table MATCH 'query'
// 8.  FTS5 bm25(): SELECT bm25(table) as score ... ORDER BY score (returns negative scores)
// 9.  Multi-table: Multiple tables in same DB, separate queries
// 10. Error handling: Invalid SQL → throws
// 11. Data types: INTEGER, TEXT, BLOB (Buffer.from), NULL
// 12. Multi-column FTS5: Search across title, description, tags columns
