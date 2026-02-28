#!/usr/bin/env bun
/**
 * sqlite-vec + FTS5 + bun:sqlite compatibility spike
 * Tests 5 core capabilities on Windows/Bun 1.3.9
 */

import { Database } from 'bun:sqlite';
import * as sqliteVec from 'sqlite-vec';

const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, status: 'PASS', error: null });
    console.log(`✓ [${results.length}/5] ${name}: PASS`);
  } catch (err) {
    results.push({ name, status: 'FAIL', error: err.message });
    console.log(`✗ [${results.length}/5] ${name}: FAIL`);
    console.log(`  Error: ${err.message}`);
  }
}

console.log('=== sqlite-vec Compatibility Spike ===\n');

// Test 1: sqlite-vec loads in bun:sqlite
test('sqlite-vec loads in bun:sqlite', () => {
  const db = new Database(':memory:');
  sqliteVec.load(db);
  db.close();
});

// Test 2: FTS5 virtual table works
test('FTS5 virtual table works', () => {
  const db = new Database(':memory:');
  db.exec('CREATE VIRTUAL TABLE fts_test USING fts5(content)');
  db.exec("INSERT INTO fts_test VALUES ('hello world')");
  db.exec("INSERT INTO fts_test VALUES ('goodbye world')");
  
  const result = db.query('SELECT * FROM fts_test WHERE fts_test MATCH ?').all('hello');
  if (result.length === 0) throw new Error('FTS5 MATCH query returned no results');
  
  db.close();
});

// Test 3: sqlite-vec + FTS5 coexist in same DB
test('sqlite-vec + FTS5 coexist in same DB', () => {
  const db = new Database(':memory:');
  sqliteVec.load(db);
  
  // Create FTS5 table
  db.exec('CREATE VIRTUAL TABLE fts_test USING fts5(content)');
  db.exec("INSERT INTO fts_test VALUES ('test content')");
  
  // Create vec table
  db.exec(`
    CREATE VIRTUAL TABLE vec_test USING vec0(
      embedding float[384]
    )
  `);
  
  // Verify both exist
  const ftsTables = db.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='fts_test'"
  ).all();
  const vecTables = db.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='vec_test'"
  ).all();
  
  if (ftsTables.length === 0) throw new Error('FTS5 table not created');
  if (vecTables.length === 0) throw new Error('vec0 table not created');
  
  db.close();
});

// Test 4: Vector KNN query works
test('Vector KNN query works', () => {
  const db = new Database(':memory:');
  sqliteVec.load(db);
  
  db.exec(`
    CREATE VIRTUAL TABLE vec_test USING vec0(
      embedding float[3]
    )
  `);
  
  // Insert a test vector (3-dimensional)
  const testVector = new Float32Array([0.1, 0.2, 0.3]);
  const vectorBytes = Buffer.from(testVector.buffer);
  
  const stmt = db.prepare('INSERT INTO vec_test(rowid, embedding) VALUES (?, ?)');
  stmt.run(1, vectorBytes);
  
  // Query with KNN
  const queryVector = new Float32Array([0.1, 0.2, 0.3]);
  const queryBytes = Buffer.from(queryVector.buffer);
  
  const result = db.query(
    'SELECT rowid, distance FROM vec_test WHERE embedding MATCH ? ORDER BY distance LIMIT 1'
  ).all(queryBytes);
  
  if (result.length === 0) throw new Error('KNN query returned no results');
  if (typeof result[0].distance !== 'number') throw new Error('distance not numeric');
  
  db.close();
});

// Test 5: FTS5 bm25() scoring works
test('FTS5 bm25() scoring works', () => {
  const db = new Database(':memory:');
  
  db.exec('CREATE VIRTUAL TABLE fts_test USING fts5(content)');
  db.exec("INSERT INTO fts_test VALUES ('hello world')");
  db.exec("INSERT INTO fts_test VALUES ('hello there')");
  db.exec("INSERT INTO fts_test VALUES ('goodbye world')");
  
  const result = db.query(
    'SELECT rowid, bm25(fts_test) as score FROM fts_test WHERE fts_test MATCH ? ORDER BY bm25(fts_test)'
  ).all('hello');
  
  if (result.length === 0) throw new Error('BM25 query returned no results');
  if (typeof result[0].score !== 'number') throw new Error('BM25 score not numeric');
  
  db.close();
});

// Summary
console.log('\n=== Summary ===');
const passed = results.filter(r => r.status === 'PASS').length;
console.log(`${passed}/5 checks passed\n`);

if (passed < 5) {
  console.log('Failed checks:');
  results.filter(r => r.status === 'FAIL').forEach(r => {
    console.log(`  - ${r.name}: ${r.error}`);
  });
  console.log();
}

// Test local embedding (diagnostic, not part of 5-check count)
console.log('=== Local Embedding Test (Diagnostic) ===');
try {
  const { pipeline } = await import('@huggingface/transformers');
  console.log('Attempting to load Xenova/all-MiniLM-L6-v2...');
  const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  const result = await embedder('test', { pooling: 'mean', normalize: true });
  console.log(`✓ Local embedding works: generated ${result.data.length}-dim vector`);
} catch (err) {
  if (err.code === 'MODULE_NOT_FOUND') {
    console.log('⚠ @huggingface/transformers not installed (expected, optional)');
  } else {
    console.log(`✗ Local embedding failed: ${err.message}`);
  }
}

process.exit(passed === 5 ? 0 : 1);
