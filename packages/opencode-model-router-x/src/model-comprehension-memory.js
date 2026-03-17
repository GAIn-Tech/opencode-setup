/**
 * Model Comprehension Memory
 * 
 * SQLite-based persistent storage for model performance data.
 * Stores task execution results and benchmark scores for learning
 * and analysis across sessions.
 * 
 * Part of: dynamic-exploration-mode.md
 */

let Database = null;
try { Database = require('better-sqlite3'); } catch { /* Fail-open: SQLite persistence unavailable, in-memory only */ }
const path = require('path');
const fs = require('fs');
let resolveDataDir;
try { ({ resolveDataDir } = require('@jackoatmon/opencode-config-loader/src/paths.js')); } catch (e) {
  try { ({ resolveDataDir } = require('../../opencode-config-loader/src/paths.js')); } catch (e2) {
    resolveDataDir = () => require('path').join(require('os').homedir(), '.opencode');
  }
}

class ModelComprehensionMemory {
  constructor(dbPath = null) {
    // Default path in user's data directory (legacy OPENCODE_CONFIG_DIR still supported)
    const configDir = process.env.OPENCODE_CONFIG_DIR || resolveDataDir();
    
    // Ensure directory exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const defaultPath = path.join(configDir, 'model-comprehension.db');
    this.dbPath = dbPath || defaultPath;
    this.db = null;
    this.data = new Map(); // In-memory cache
  }

  /**
   * Initialize database and schema
   */
  async initialize() {
    if (!Database) {
      console.warn('[ModelComprehensionMemory] better-sqlite3 not available — running in-memory only');
      return;
    }
    try {
      this.db = new Database(this.dbPath);

      // Enable WAL mode for better concurrent access
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = -64000'); // 64MB cache

      this._createSchema();
      this._runMigrations();
      await this.load();

      console.log(`[ModelComprehensionMemory] Initialized at: ${this.dbPath}`);
    } catch (err) {
      console.warn('[ModelComprehensionMemory] Initialization failed, running in-memory only:', err.message);
      this.db = null;
    }
  }

  /**
   * Create database tables
   */
  _createSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Main performance tracking table
      CREATE TABLE IF NOT EXISTS model_performance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        intent_category TEXT NOT NULL,
        model_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        is_exploration INTEGER DEFAULT 0,
        accuracy REAL,
        latency REAL,
        cost REAL,
        success INTEGER,
        tokens_used INTEGER,
        complexity REAL,
        file_size INTEGER,
        language TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Index for model-task lookups
      CREATE INDEX IF NOT EXISTS idx_model_task 
        ON model_performance(model_id, intent_category);

      -- Index for timestamp-based queries
      CREATE INDEX IF NOT EXISTS idx_timestamp 
        ON model_performance(timestamp);

      -- Benchmark scores table
      CREATE TABLE IF NOT EXISTS model_benchmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_id TEXT NOT NULL,
        benchmark_name TEXT NOT NULL,
        score REAL,
        normalized_score REAL,
        details TEXT,
        timestamp INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Index for benchmark queries
      CREATE INDEX IF NOT EXISTS idx_benchmark_model 
        ON model_benchmarks(model_id);

      -- Provider model registry (cached from discovery)
      CREATE TABLE IF NOT EXISTS discovered_models (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        model_id TEXT NOT NULL,
        context_tokens INTEGER,
        output_tokens INTEGER,
        deprecated INTEGER DEFAULT 0,
        discovered_at INTEGER NOT NULL,
        UNIQUE(provider, model_id)
      );

      CREATE INDEX IF NOT EXISTS idx_discovered_provider 
        ON discovered_models(provider);
    `);
  }

  _runMigrations() {
    const row = this.db.prepare('SELECT version FROM schema_meta WHERE id = 1').get();
    if (!row) {
      this.db.prepare('INSERT INTO schema_meta (id, version) VALUES (1, 1)').run();
      return;
    }

    const version = row.version || 1;
    if (version < 1) {
      this.db.prepare('UPDATE schema_meta SET version = 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run();
    }
  }

  /**
   * Load recent data into memory cache
   * @param {number} daysToKeep - Days of history to keep in memory
   */
  async load(daysToKeep = 30) {
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

    const rows = this.db.prepare(`
      SELECT * FROM model_performance
      WHERE timestamp > ?
      ORDER BY timestamp DESC
    `).all(cutoffTime);

    // Build in-memory index
    for (const row of rows) {
      const key = `${row.intent_category}:${row.model_id}`;
      if (!this.data.has(key)) {
        this.data.set(key, []);
      }
      this.data.get(key).push(row);
    }

    console.log(`[ModelComprehensionMemory] Loaded ${rows.length} records into cache`);
  }

  /**
   * Store a performance observation
   * @param {Object} metrics - Performance metrics
   */
  async store(metrics) {
    if (!this.db) return;
    const stmt = this.db.prepare(`
      INSERT INTO model_performance (
        task_id, intent_category, model_id, provider, timestamp,
        is_exploration, accuracy, latency, cost, success,
        tokens_used, complexity, file_size, language
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      metrics.taskId,
      metrics.intentCategory,
      metrics.modelId,
      metrics.provider,
      metrics.timestamp,
      metrics.isExploration ? 1 : 0,
      metrics.accuracy,
      metrics.latency,
      metrics.cost,
      metrics.success ? 1 : 0,
      metrics.tokensUsed,
      metrics.complexity,
      metrics.fileSize,
      metrics.language
    );

    // Update in-memory cache
    const key = `${metrics.intentCategory}:${metrics.modelId}`;
    if (!this.data.has(key)) {
      this.data.set(key, []);
    }
    this.data.get(key).push(metrics);
  }

  /**
   * Get metrics for a specific model-task pair
   * @param {string} intentCategory - Task category
   * @param {string} modelId - Model identifier
   * @returns {Array} Array of metrics records
   */
  async getMetrics(intentCategory, modelId) {
    const key = `${intentCategory}:${modelId}`;
    return this.data.get(key) || [];
  }

  /**
   * Get aggregated statistics for a model
   * @param {string} modelId - Model identifier
   * @returns {Object} Aggregated stats
   */
  async getModelStats(modelId) {
    if (!this.db) return null;
    const rows = this.db.prepare(`
      SELECT 
        COUNT(*) as total_attempts,
        SUM(success) as successes,
        AVG(accuracy) as avg_accuracy,
        AVG(latency) as avg_latency,
        AVG(cost) as avg_cost,
        AVG(tokens_used) as avg_tokens
      FROM model_performance
      WHERE model_id = ?
    `).get(modelId);

    return rows;
  }

  /**
   * Store benchmark score
   * @param {Object} benchmark - Benchmark data
   */
  async storeBenchmark(benchmark) {
    if (!this.db) return;
    const stmt = this.db.prepare(`
      INSERT INTO model_benchmarks (
        model_id, benchmark_name, score, normalized_score, details, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      benchmark.modelId,
      benchmark.name,
      benchmark.score,
      benchmark.normalizedScore,
      JSON.stringify(benchmark.details || {}),
      Date.now()
    );
  }

  /**
   * Get benchmarks for a model
   * @param {string} modelId - Model identifier
   * @returns {Array} Benchmark records
   */
  async getBenchmarks(modelId) {
    if (!this.db) return [];
    return this.db.prepare(`
      SELECT * FROM model_benchmarks
      WHERE model_id = ?
      ORDER BY timestamp DESC
    `).all(modelId);
  }

  async exportBenchmarks(format = 'json') {
    if (!this.db) return format === 'csv' ? '' : '[]';
    const rows = this.db.prepare('SELECT * FROM model_benchmarks ORDER BY timestamp DESC').all();
    if (format === 'csv') {
      const header = 'model_id,benchmark_name,score,normalized_score,timestamp';
      const lines = rows.map((row) => [
        row.model_id,
        row.benchmark_name,
        row.score,
        row.normalized_score,
        row.timestamp
      ].join(','));
      return [header, ...lines].join('\n');
    }
    return JSON.stringify(rows, null, 2);
  }

  /**
   * Store discovered model
   * @param {Object} model - Model data from discovery
   */
  async storeDiscoveredModel(model) {
    if (!this.db) return;
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO discovered_models (
        provider, model_id, context_tokens, output_tokens, deprecated, discovered_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      model.provider,
      model.id,
      model.contextTokens,
      model.outputTokens,
      model.deprecated ? 1 : 0,
      Date.now()
    );
  }

  /**
   * Get all discovered models
   * @returns {Array} Discovered models
   */
  async getDiscoveredModels() {
    if (!this.db) return [];
    return this.db.prepare(`
      SELECT * FROM discovered_models
      ORDER BY provider, model_id
    `).all();
  }

  /**
   * Clean up old records
   * @param {number} daysToKeep - Days of history to retain
   */
  async cleanup(daysToKeep = 90) {
    if (!this.db) return;
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    
    const result = this.db.prepare(`
      DELETE FROM model_performance
      WHERE timestamp < ?
    `).run(cutoffTime);

    console.log(`[ModelComprehensionMemory] Cleaned up ${result.changes} old records`);
  }

  /**
   * Get in-memory cache
   * @returns {Map} Cache data
   */
  getData() {
    return this.data;
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      console.log('[ModelComprehensionMemory] Closed');
    }
  }
}

module.exports = ModelComprehensionMemory;
