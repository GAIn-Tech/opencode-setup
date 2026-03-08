import { describe, it, expect } from 'bun:test';
import { Database } from 'bun:sqlite';

describe('SQLite/FTS5 Spike Tests', () => {
  // Helper: Create fresh in-memory database for each test
  const createTestDB = () => new Database(':memory:');

  // Test 1: Database creation
  it('creates in-memory database successfully', () => {
    const db = createTestDB();
    expect(db).toBeDefined();
    expect(typeof db.prepare).toBe('function');
    db.close();
  });

  // Test 2: Basic table operations (CREATE, INSERT, SELECT)
  it('performs basic table operations: CREATE, INSERT, SELECT', () => {
    const db = createTestDB();
    
    // CREATE TABLE
    db.exec(`
      CREATE TABLE documents (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT
      )
    `);
    
    // INSERT
    const insert = db.prepare('INSERT INTO documents (title, content) VALUES (?, ?)');
    insert.run('Test Doc', 'This is test content');
    insert.run('Another Doc', 'More content here');
    
    // SELECT
    const select = db.prepare('SELECT * FROM documents WHERE id = ?');
    const row = select.get(1);
    
    expect(row).toBeDefined();
    expect(row.title).toBe('Test Doc');
    expect(row.content).toBe('This is test content');
    
    db.close();
  });

  // Test 3: Prepared statements with parameterized queries
  it('uses prepared statements for parameterized queries', () => {
    const db = createTestDB();
    
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)');
    
    const insert = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
    insert.run('Alice', 'alice@example.com');
    insert.run('Bob', 'bob@example.com');
    
    const selectByName = db.prepare('SELECT * FROM users WHERE name = ?');
    const user = selectByName.get('Alice');
    
    expect(user.name).toBe('Alice');
    expect(user.email).toBe('alice@example.com');
    
    db.close();
  });

  // Test 4: Transactions - commit
  it('commits transactions correctly', () => {
    const db = createTestDB();
    
    db.exec('CREATE TABLE accounts (id INTEGER PRIMARY KEY, balance INTEGER)');
    
    const transaction = db.transaction(() => {
      db.prepare('INSERT INTO accounts (balance) VALUES (?)').run(100);
      db.prepare('INSERT INTO accounts (balance) VALUES (?)').run(200);
    });
    
    transaction();
    
    const count = db.prepare('SELECT COUNT(*) as cnt FROM accounts').get();
    expect(count.cnt).toBe(2);
    
    db.close();
  });

  // Test 5: Transactions - rollback
  it('rolls back transactions on error', () => {
    const db = createTestDB();
    
    db.exec('CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)');
    db.prepare('INSERT INTO items (name) VALUES (?)').run('Initial');
    
    const transaction = db.transaction(() => {
      db.prepare('INSERT INTO items (name) VALUES (?)').run('Before Error');
      throw new Error('Intentional error');
    });
    
    try {
      transaction();
    } catch (e) {
      // Expected error
    }
    
    const count = db.prepare('SELECT COUNT(*) as cnt FROM items').get();
    expect(count.cnt).toBe(1); // Only initial item, rollback worked
    
    db.close();
  });

  // Test 6: FTS5 virtual table creation
  it('creates FTS5 virtual table successfully', () => {
    const db = createTestDB();
    
    db.exec(`
      CREATE VIRTUAL TABLE documents_fts USING fts5(
        title,
        content,
        tokenize = 'porter'
      )
    `);
    
    const insert = db.prepare('INSERT INTO documents_fts (title, content) VALUES (?, ?)');
    insert.run('Running Shoes', 'High quality running shoes for athletes');
    insert.run('Walking Shoes', 'Comfortable shoes for daily walking');
    
    const count = db.prepare('SELECT COUNT(*) as cnt FROM documents_fts').get();
    expect(count.cnt).toBe(2);
    
    db.close();
  });

  // Test 7: FTS5 MATCH queries return correct results
  it('performs FTS5 MATCH queries and returns correct results', () => {
    const db = createTestDB();
    
    db.exec(`
      CREATE VIRTUAL TABLE articles_fts USING fts5(
        title,
        body
      )
    `);
    
    const insert = db.prepare('INSERT INTO articles_fts (title, body) VALUES (?, ?)');
    insert.run('SQLite Guide', 'Learn how to use SQLite database');
    insert.run('Python Tutorial', 'Learn Python programming language');
    insert.run('SQLite Performance', 'Optimize SQLite queries for speed');
    
    // Search for "SQLite"
    const results = db.prepare('SELECT * FROM articles_fts WHERE articles_fts MATCH ?').all('SQLite');
    
    expect(results.length).toBe(2);
    expect(results[0].title).toMatch(/SQLite/);
    expect(results[1].title).toMatch(/SQLite/);
    
    db.close();
  });

  // Test 8: FTS5 bm25() scoring function
  it('uses FTS5 bm25() scoring function for ranking', () => {
    const db = createTestDB();
    
    db.exec(`
      CREATE VIRTUAL TABLE docs_fts USING fts5(
        title,
        content
      )
    `);
    
    const insert = db.prepare('INSERT INTO docs_fts (title, content) VALUES (?, ?)');
    insert.run('Database Basics', 'Introduction to databases and SQL');
    insert.run('Advanced Database', 'Database optimization and indexing');
    insert.run('Web Development', 'Building web applications with databases');
    
    // Query with bm25 scoring - search for "database" which matches 2 docs
    const results = db.prepare(`
      SELECT title, bm25(docs_fts) as score 
      FROM docs_fts 
      WHERE docs_fts MATCH 'database'
      ORDER BY score
    `).all();
    
    expect(results.length).toBe(2);
    expect(typeof results[0].score).toBe('number');
    expect(results[0].score).toBeLessThan(0); // bm25 returns negative scores
    
    db.close();
  });

  // Test 9: Multiple tables in same database
  it('creates and queries multiple tables in same database', () => {
    const db = createTestDB();
    
    // Create first table
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT
      )
    `);
    
    // Create second table
    db.exec(`
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
        title TEXT
      )
    `);
    
    // Insert into both
    db.prepare('INSERT INTO users (name) VALUES (?)').run('Alice');
    db.prepare('INSERT INTO posts (user_id, title) VALUES (?, ?)').run(1, 'First Post');
    
    // Query both
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(1);
    const post = db.prepare('SELECT * FROM posts WHERE user_id = ?').get(1);
    
    expect(user.name).toBe('Alice');
    expect(post.title).toBe('First Post');
    
    db.close();
  });

  // Test 10: Error handling for invalid SQL
  it('throws error on invalid SQL', () => {
    const db = createTestDB();
    
    expect(() => {
      db.exec('INVALID SQL SYNTAX HERE');
    }).toThrow();
    
    db.close();
  });

  // Test 11: Data types - integers, text, blobs, nulls
  it('stores and retrieves various data types correctly', () => {
    const db = createTestDB();
    
    db.exec(`
      CREATE TABLE data_types (
        id INTEGER PRIMARY KEY,
        int_val INTEGER,
        text_val TEXT,
        blob_val BLOB,
        null_val TEXT
      )
    `);
    
    const insert = db.prepare(`
      INSERT INTO data_types (int_val, text_val, blob_val, null_val) 
      VALUES (?, ?, ?, ?)
    `);
    
    const blobData = Buffer.from('binary data');
    insert.run(42, 'Hello World', blobData, null);
    
    const row = db.prepare('SELECT * FROM data_types WHERE id = ?').get(1);
    
    expect(row.int_val).toBe(42);
    expect(row.text_val).toBe('Hello World');
    expect(row.blob_val).toEqual(blobData);
    expect(row.null_val).toBeNull();
    
    db.close();
  });

  // Test 12: FTS5 with multiple columns and complex queries
  it('performs complex FTS5 queries with multiple columns', () => {
    const db = createTestDB();
    
    db.exec(`
      CREATE VIRTUAL TABLE memories_fts USING fts5(
        title,
        description,
        tags
      )
    `);
    
    const insert = db.prepare(`
      INSERT INTO memories_fts (title, description, tags) 
      VALUES (?, ?, ?)
    `);
    
    insert.run('Meeting Notes', 'Discussed project timeline', 'work meeting');
    insert.run('Coffee Break', 'Took a break with colleagues', 'social break');
    insert.run('Project Review', 'Reviewed completed work items', 'work review');
    
    // Search for "work" in any column
    const results = db.prepare(`
      SELECT title, description 
      FROM memories_fts 
      WHERE memories_fts MATCH 'work'
    `).all();
    
    expect(results.length).toBe(2);
    expect(results.some(r => r.title === 'Meeting Notes')).toBe(true);
    expect(results.some(r => r.title === 'Project Review')).toBe(true);
    
    db.close();
  });
});
