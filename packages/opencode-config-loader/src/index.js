'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Centralized configuration loader for OpenCode.
 * 
 * Loads configuration from multiple sources with precedence:
 * 1. Environment variables (highest priority)
 * 2. Local .opencode.config.json (project root)
 * 3. User config ~/.opencode/config.json
 * 4. Default values (lowest priority)
 */
class ConfigLoader {
  constructor(configPath = null) {
    this._config = null;
    this._configPath = configPath;
    this._defaults = this._getDefaults();
  }

  /**
   * Default configuration values.
   */
  _getDefaults() {
    return {
      runtime: {
        bun: {
          heapLimit: '4096mb'
        }
      },
      performance: {
        concurrency: {
          defaultLimit: 5
        },
        batchSize: {
          sessionProcessing: 10,
          graphEntries: 10
        },
        lruCache: {
          maxEntries: 10000
        }
      },
      database: {
        wal: {
          checkpointInterval: 1000,
          cleanupIntervalMs: 300000
        }
      },
      logging: {
        rotation: {
          maxFiles: 5,
          maxSizeMb: 10
        },
        healthd: {
          checkIntervalMs: 300000
        }
      },
      sessions: {
        ttl: {
          defaultMs: 86400000
        }
      },
      features: {
        autoCleanup: {
          enabled: true
        },
        memoryOptimizations: {
          enabled: true,
          streamingEnabled: true,
          batchingEnabled: true,
          lruEnabled: true
        }
      },
      paths: {
        opencodeDir: path.join(os.homedir(), '.opencode'),
        logsDir: path.join(os.homedir(), '.opencode'),
        databaseDir: path.join(os.homedir(), '.opencode')
      }
    };
  }

  /**
   * Find config file by searching up directory tree from cwd.
   */
  _findConfigFile() {
    if (this._configPath && fs.existsSync(this._configPath)) {
      return this._configPath;
    }

    // Try project root
    let currentDir = process.cwd();
    const root = path.parse(currentDir).root;

    while (currentDir !== root) {
      const configFile = path.join(currentDir, '.opencode.config.json');
      if (fs.existsSync(configFile)) {
        return configFile;
      }
      currentDir = path.dirname(currentDir);
    }

    // Try user home directory
    const userConfig = path.join(os.homedir(), '.opencode', 'config.json');
    if (fs.existsSync(userConfig)) {
      return userConfig;
    }

    return null;
  }

  /**
   * Load configuration from file.
   */
  _loadConfigFile() {
    const configFile = this._findConfigFile();
    if (!configFile) {
      return {};
    }

    try {
      const content = fs.readFileSync(configFile, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      console.warn(`[ConfigLoader] Failed to load config from ${configFile}: ${err.message}`);
      return {};
    }
  }

  /**
   * Deep merge two objects.
   */
  _deepMerge(target, source) {
    const result = { ...target };
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this._deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  /**
   * Apply environment variable overrides.
   * 
   * Env vars use OPENCODE_ prefix with underscores for nesting:
   * OPENCODE_PERFORMANCE_CONCURRENCY_DEFAULTLIMIT=10
   */
  _applyEnvOverrides(config) {
    const envPrefix = 'OPENCODE_';
    const result = { ...config };

    for (const [key, value] of Object.entries(process.env)) {
      if (!key.startsWith(envPrefix)) continue;

      const path = key.slice(envPrefix.length).toLowerCase().split('_');
      let current = result;

      for (let i = 0; i < path.length - 1; i++) {
        const segment = path[i];
        if (!current[segment]) current[segment] = {};
        current = current[segment];
      }

      const lastKey = path[path.length - 1];
      
      // Try to parse as JSON, fall back to string
      try {
        current[lastKey] = JSON.parse(value);
      } catch {
        current[lastKey] = value;
      }
    }

    return result;
  }

  /**
   * Enable hot-reload of configuration.
   * Watches config file and reloads on change.
   * @param {Function} onReload - Callback when config reloads
   * @param {number} intervalMs - Check interval (default 5000ms)
   */
  enableHotReload(onReload, intervalMs = 5000) {
    const configFile = this._findConfigFile();
    if (!configFile) {
      console.warn('[ConfigLoader] No config file found for hot-reload');
      return;
    }

    let lastMtime = null;
    try {
      lastMtime = fs.statSync(configFile).mtimeMs;
    } catch (e) {
      console.warn('[ConfigLoader] Cannot stat config file for hot-reload');
      return;
    }

    const watcher = setInterval(() => {
      try {
        const stats = fs.statSync(configFile);
        if (stats.mtimeMs !== lastMtime) {
          lastMtime = stats.mtimeMs;
          this._config = null; // Clear cache
          const newConfig = this.load();
          console.log('[ConfigLoader] Config hot-reloaded');
          if (onReload) onReload(newConfig);
        }
      } catch (e) {
        // Ignore errors during watch
      }
    }, intervalMs);

    // Return cleanup function
    return () => clearInterval(watcher);
  }

  /**
   * Load and merge all configuration sources.
   */
  load() {
    if (this._config) return this._config;

    const defaults = this._defaults;
    const fileConfig = this._loadConfigFile();
    const merged = this._deepMerge(defaults, fileConfig);
    this._config = this._applyEnvOverrides(merged);

    return this._config;
  }

  /**
   * Get a configuration value by dot-notation path.
   * 
   * @param {string} path - Dot-notation path (e.g., 'performance.concurrency.defaultLimit')
   * @param {*} defaultValue - Default value if path not found
   * @returns {*}
   */
  get(path, defaultValue = undefined) {
    const config = this.load();
    const segments = path.split('.');
    let current = config;

    for (const segment of segments) {
      if (current && typeof current === 'object' && segment in current) {
        current = current[segment];
      } else {
        return defaultValue;
      }
    }

    return current;
  }

  /**
   * Get entire configuration object.
   */
  getAll() {
    return this.load();
  }

  /**
   * Reload configuration from disk.
   */
  reload() {
    this._config = null;
    return this.load();
  }
}

// Singleton instance
let _instance = null;

/**
 * Get singleton ConfigLoader instance.
 */
function getConfig() {
  if (!_instance) {
    _instance = new ConfigLoader();
  }
  return _instance;
}

module.exports = { ConfigLoader, getConfig };
