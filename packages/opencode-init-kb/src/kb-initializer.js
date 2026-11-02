/**
 * KbInitializer - Knowledge Base Initialization Module
 * 
 * Provides template-based KB initialization, project-specific audit templates,
 * and cross-project learning sync for OpenCode workspace.
 * 
 * Phase 1: Detection and Initialization (MVP)
 */

const fsSync = require('fs');
const path = require('path');
const os = require('os');

const OPENCODE_DIRNAME = '.opencode';

function resolveDataHome() {
  if (process.env.OPENCODE_DATA_HOME) return process.env.OPENCODE_DATA_HOME;
  if (process.env.XDG_DATA_HOME) return path.join(process.env.XDG_DATA_HOME, 'opencode');
  const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(homeDir, OPENCODE_DIRNAME);
}

class KbInitializer {
  constructor(options = {}) {
    this.workspaceRoot = options.workspaceRoot || process.cwd();
    this.persistPath = options.persistPath || path.join(resolveDataHome(), 'kb-init-state.json');
    this.templateDir = options.templateDir || path.join(__dirname, 'templates');
    this.forceInit = options.forceInit || false;
    this._ensureDir();
  }

  _ensureDir() {
    const dir = path.dirname(this.persistPath);
    if (!fsSync.existsSync(dir)) {
      fsSync.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Detect if KB initialization is needed
   * @returns {Object} Detection result with needsInit, reason, metadata
   */
  detectInitNeeded() {
    // Check 1: Does .sisyphus/kb/ exist?
    const kbDir = path.join(this.workspaceRoot, '.sisyphus', 'kb');
    const kbExists = fsSync.existsSync(kbDir);
    
    if (!kbExists) {
      return {
        needsInit: true,
        reason: 'KB directory does not exist',
        metadata: { kbDir, action: 'create' }
      };
    }

    // Check 2: Does core KB files exist?
    const coreFiles = ['meta-knowledge.json', 'audit-templates.json', 'project-states.json'];
    const missingFiles = coreFiles.filter(f => !fsSync.existsSync(path.join(kbDir, f)));
    
    if (missingFiles.length > 0) {
      return {
        needsInit: true,
        reason: 'Missing core KB files',
        metadata: { missingFiles, action: 'create' }
      };
    }

    // Check 3: Is forceInit enabled?
    if (this.forceInit) {
      return {
        needsInit: true,
        reason: 'Force initialization requested',
        metadata: { forceInit: true }
      };
    }

    // Check 4: KB state file exists
    const stateExists = fsSync.existsSync(this.persistPath);
    if (!stateExists) {
      return {
        needsInit: true,
        reason: 'No KB init state found',
        metadata: { action: 'init' }
      };
    }

    // KB appears initialized
    return {
      needsInit: false,
      reason: 'KB already initialized',
      metadata: { kbDir, stateFile: this.persistPath }
    };
  }

  /**
   * Initialize the Knowledge Base
   * @param {Object} options - Init options
   * @returns {Object} Init result with success, files
   */
  initialize(options = {}) {
    const { templateType = 'default' } = options;
    
    const kbDir = path.join(this.workspaceRoot, '.sisyphus', 'kb');
    
    // Create KB directory
    if (!fsSync.existsSync(kbDir)) {
      fsSync.mkdirSync(kbDir, { recursive: true });
    }

    // Core files to create
    const coreFiles = {
      'meta-knowledge.json': this._getMetaKnowledgeTemplate(),
      'audit-templates.json': this._getAuditTemplatesTemplate(),
      'project-states.json': this._getProjectStatesTemplate(),
      'learning-sync.json': this._getLearningSyncTemplate()
    };

    const createdFiles = [];
    for (const [filename, content] of Object.entries(coreFiles)) {
      const filepath = path.join(kbDir, filename);
      const isUpdate = fsSync.existsSync(filepath);
      
      fsSync.writeFileSync(filepath, JSON.stringify(content, null, 2));
      createdFiles.push({ filename, filepath, isUpdate });
    }

    // Save init state
    const initState = {
      initialized: true,
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      templateType,
      files: createdFiles.map(f => f.filename)
    };
    
    fsSync.writeFileSync(this.persistPath, JSON.stringify(initState, null, 2));

    return {
      success: true,
      kbDir,
      files: createdFiles,
      state: initState
    };
  }

  /**
   * Get meta-knowledge template
   */
  _getMetaKnowledgeTemplate() {
    return {
      schema: 'meta-kb-v1',
      created: new Date().toISOString(),
      projects: {},
      globalPatterns: [],
      skillUsageStats: {},
      modelPerformance: {}
    };
  }

  /**
   * Get audit templates for initial projects
   */
  _getAuditTemplatesTemplate() {
    return {
      schema: 'audit-templates-v1',
      templates: [
        {
          id: 'default-code-quality',
          name: 'Code Quality Audit',
          description: 'Standard code quality checks',
          checks: ['naming-conventions', 'function-length', 'complexity', 'duplicates']
        },
        {
          id: 'default-security',
          name: 'Security Audit',
          description: 'Basic security checks',
          checks: ['hardcoded-secrets', 'sql-injection', 'xss-vulnerabilities']
        },
        {
          id: 'default-performance',
          name: 'Performance Audit',
          description: 'Performance optimization checks',
          checks: ['n-plus-one', 'missing-indexes', 'memory-leaks']
        }
      ]
    };
  }

  /**
   * Get project states template
   */
  _getProjectStatesTemplate() {
    return {
      schema: 'project-states-v1',
      projects: {},
      lastSync: null
    };
  }

  /**
   * Get learning sync configuration template
   */
  _getLearningSyncTemplate() {
    return {
      schema: 'learning-sync-v1',
      syncEnabled: false,
      autoSync: false,
      intervalMs: 3600000, // 1 hour
      lastSync: null,
      crossProjectLearning: {
        enabled: false,
        globalPatterns: [],
        modelPerformance: []
      }
    };
  }

  /**
   * Get init state
   */
  getState() {
    if (!fsSync.existsSync(this.persistPath)) {
      return null;
    }
    return JSON.parse(fsSync.readFileSync(this.persistPath, 'utf-8'));
  }

  /**
   * Reset KB state (for testing)
   */
  reset() {
    const kbDir = path.join(this.workspaceRoot, '.sisyphus', 'kb');
    if (fsSync.existsSync(kbDir)) {
      fsSync.rmSync(kbDir, { recursive: true });
    }
    if (fsSync.existsSync(this.persistPath)) {
      fsSync.unlinkSync(this.persistPath);
    }
    return { success: true };
  }
}

module.exports = { KbInitializer };
