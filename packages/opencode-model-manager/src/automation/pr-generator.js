'use strict';

const fsSync = require('fs');
const fs = require('fs').promises;
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

/** Timeout for git commands (30s) */
const GIT_TIMEOUT_MS = 30000;
const NULL_HOOKS_PATH = process.platform === 'win32' ? 'NUL' : '/dev/null';

/**
 * PR Generator for automated model catalog updates.
 * 
 * Creates GitHub PRs with model changes from discovery pipeline.
 */
class PRGenerator {
  /**
   * @param {object} options - Configuration options
   * @param {string} options.catalogPath - Path to catalog-2026.json
   * @param {string} options.repoPath - Path to git repository
   * @param {string} options.baseBranch - Base branch (default: main)
   */
  constructor(options = {}) {
    this.catalogPath = options.catalogPath || path.join(process.cwd(), 'opencode-config/models/catalog-2026.json');
    this.repoPath = options.repoPath || process.cwd();
    this.baseBranch = options.baseBranch || 'main';
  }

  /**
   * Generate PR for model updates.
   * 
   * @param {object} diff - Diff from DiffEngine
   * @param {object} options - PR options
   * @returns {Promise<object>} PR details
   */
  async generatePR(diff, options = {}) {
    const timestamp = Date.now();
    const branchName = `auto/model-update-${timestamp}`;
    
    // Create branch
    await this.createBranch(branchName);
    
    // Update catalog
    await this.updateCatalog(diff);
    
    // Commit changes
    await this.commitChanges(diff, branchName);
    
    // Generate PR body
    const prBody = this.generatePRBody(diff);
    
    // Push branch
    await this.pushBranch(branchName);

    const title = this.generatePRTitle(diff);
    const prUrl = options.createPullRequest === true
      ? await this.createPullRequest({
          branchName,
          title,
          body: prBody,
          draft: options.draft === true
        })
      : null;
    
    return {
      branch: branchName,
      title,
      body: prBody,
      prUrl,
      timestamp
    };
  }

  /**
   * Create git branch.
   */
  async createBranch(branchName) {
    try {
      const repoPath = resolveTrustedRepoPath(this.repoPath);
      await execFileAsync('git', ['-c', `core.hooksPath=${NULL_HOOKS_PATH}`, 'checkout', '-b', branchName], {
        timeout: GIT_TIMEOUT_MS,
        cwd: repoPath
      });
    } catch (error) {
      throw new Error(`Failed to create branch: ${error.message}`);
    }
  }

  /**
   * Update catalog file with new models.
   */
  async updateCatalog(diff) {
    try {
      const catalog = await this.previewCatalogUpdate(diff);
      await fs.writeFile(
        this.catalogPath,
        JSON.stringify(catalog, null, 2) + '\n',
        'utf-8'
      );

      return catalog;
    } catch (error) {
      throw new Error(`Failed to update catalog: ${error.message}`);
    }
  }

  async previewCatalogUpdate(diff) {
    try {
      const catalogContent = await fs.readFile(this.catalogPath, 'utf-8');
      const catalog = JSON.parse(catalogContent);
      const shape = Array.isArray(catalog.models) ? 'array' : 'object';
      const timestamp = Date.now();

      if (shape === 'array') {
        catalog.models = Array.isArray(catalog.models) ? catalog.models.slice() : [];
        applyArrayCatalogChanges(catalog.models, diff, timestamp);
      } else {
        catalog.models = isObject(catalog.models) ? { ...catalog.models } : {};
        applyObjectCatalogChanges(catalog.models, diff, timestamp);
      }

      catalog.lastUpdated = new Date(timestamp).toISOString();
      return catalog;
    } catch (error) {
      throw new Error(`Failed to preview catalog update: ${error.message}`);
    }
  }

  /**
   * Commit changes.
   */
  async commitChanges(diff, branchName) {
    try {
      const repoPath = resolveTrustedRepoPath(this.repoPath);
      await execFileAsync('git', ['-c', `core.hooksPath=${NULL_HOOKS_PATH}`, 'add', this.catalogPath], {
        timeout: GIT_TIMEOUT_MS,
        cwd: repoPath
      });
      
      const commitMessage = this.generateCommitMessage(diff);
      await execFileAsync('git', ['-c', `core.hooksPath=${NULL_HOOKS_PATH}`, 'commit', '-m', commitMessage], {
        timeout: GIT_TIMEOUT_MS,
        cwd: repoPath
      });
    } catch (error) {
      throw new Error(`Failed to commit changes: ${error.message}`);
    }
  }

  /**
   * Push branch to remote.
   */
  async pushBranch(branchName) {
    try {
      const repoPath = resolveTrustedRepoPath(this.repoPath);
      await execFileAsync('git', ['-c', `core.hooksPath=${NULL_HOOKS_PATH}`, 'push', '-u', 'origin', branchName], {
        timeout: GIT_TIMEOUT_MS,
        cwd: repoPath
      });
    } catch (error) {
      throw new Error(`Failed to push branch: ${error.message}`);
    }
  }

  async createPullRequest({ branchName, title, body, draft = false }) {
    try {
      const repoPath = resolveTrustedRepoPath(this.repoPath);
      assertCommandAvailable('gh');

      const args = [
        'pr',
        'create',
        '--base', this.baseBranch,
        '--head', branchName,
        '--title', title,
        '--body', body
      ];

      if (draft) {
        args.push('--draft');
      }

      const { stdout } = await execFileAsync('gh', args, {
        timeout: GIT_TIMEOUT_MS,
        cwd: repoPath
      });

      return String(stdout || '').trim();
    } catch (error) {
      throw new Error(`Failed to create pull request: ${error.message}`);
    }
  }

  /**
   * Generate PR title.
   */
  generatePRTitle(diff) {
    const addedCount = diff.added.length;
    const modifiedCount = diff.modified.length;
    const removedCount = diff.removed.length;
    
    const providers = new Set([
      ...diff.added.map(c => c.provider),
      ...diff.modified.map(c => c.provider),
      ...diff.removed.map(c => c.provider)
    ]);
    
    const providerList = Array.from(providers).join(', ');
    
    return `[AUTO] Model updates from ${providerList} (${addedCount} new, ${modifiedCount} updated, ${removedCount} removed)`;
  }

  /**
   * Generate commit message.
   */
  generateCommitMessage(diff) {
    const addedCount = diff.added.length;
    const modifiedCount = diff.modified.length;
    
    return `chore(models): update catalog with ${addedCount} new and ${modifiedCount} updated models`;
  }

  /**
   * Generate PR body with summary and diff table.
   */
  generatePRBody(diff) {
    const sections = [];
    
    // Summary
    sections.push('## Summary');
    sections.push('');
    sections.push(`Automated model catalog update from discovery pipeline.`);
    sections.push('');
    sections.push(`- **Added**: ${diff.added.length} models`);
    sections.push(`- **Modified**: ${diff.modified.length} models`);
    sections.push(`- **Removed**: ${diff.removed.length} models`);
    sections.push('');
    
    // Added models
    if (diff.added.length > 0) {
      sections.push('## Added Models');
      sections.push('');
      sections.push('| Model ID | Provider | Context Tokens | Classification |');
      sections.push('|----------|----------|----------------|----------------|');
      for (const change of diff.added) {
        sections.push(`| ${change.model.id} | ${change.provider} | ${change.model.contextTokens || 'N/A'} | ${change.classification} |`);
      }
      sections.push('');
    }
    
    // Modified models
    if (diff.modified.length > 0) {
      sections.push('## Modified Models');
      sections.push('');
      sections.push('| Model ID | Provider | Changes | Classification |');
      sections.push('|----------|----------|---------|----------------|');
      for (const change of diff.modified) {
        const changeKeys = Object.keys(change.changes || {}).join(', ');
        sections.push(`| ${change.model.id} | ${change.provider} | ${changeKeys} | ${change.classification} |`);
      }
      sections.push('');
    }
    
    // Removed models
    if (diff.removed.length > 0) {
      sections.push('## Removed Models');
      sections.push('');
      sections.push('| Model ID | Provider | Classification |');
      sections.push('|----------|----------|----------------|');
      for (const change of diff.removed) {
        sections.push(`| ${change.model.id} | ${change.provider} | ${change.classification} |`);
      }
      sections.push('');
    }
    
    // Risk Assessment
    sections.push('## Risk Assessment');
    sections.push('');
    const majorChanges = [
      ...diff.added.filter(c => c.classification === 'major'),
      ...diff.modified.filter(c => c.classification === 'major'),
      ...diff.removed
    ];
    
    if (majorChanges.length > 0) {
      sections.push(`⚠️ **${majorChanges.length} major changes** require review`);
    } else {
      sections.push(`✅ All changes are minor and low-risk`);
    }
    sections.push('');
    
    // Testing Checklist
    sections.push('## Testing Checklist');
    sections.push('');
    sections.push('- [ ] Catalog schema validation passes');
    sections.push('- [ ] No duplicate model IDs');
    sections.push('- [ ] All required fields present');
    sections.push('- [ ] Backward compatibility maintained');
    sections.push('');
    
    return sections.join('\n');
  }
}

function applyArrayCatalogChanges(models, diff, timestamp) {
  for (const change of diff.added) {
    models.push(buildCatalogEntry(change, timestamp));
  }

  for (const change of diff.modified) {
    const existingIndex = models.findIndex((model) => matchesCatalogEntry(model, change));
    if (existingIndex >= 0) {
      models[existingIndex] = {
        ...models[existingIndex],
        ...buildCatalogEntry(change, timestamp),
        updatedAt: timestamp
      };
    }
  }

  for (const change of diff.removed) {
    const existingIndex = models.findIndex((model) => matchesCatalogEntry(model, change));
    if (existingIndex >= 0) {
      models[existingIndex] = {
        ...models[existingIndex],
        deprecated: true,
        deprecatedAt: timestamp
      };
    }
  }
}

function applyObjectCatalogChanges(models, diff, timestamp) {
  for (const change of diff.added) {
    const key = resolveCatalogKey(change);
    models[key] = buildCatalogEntry(change, timestamp, models[key]);
  }

  for (const change of diff.modified) {
    const key = resolveCatalogKey(change);
    if (models[key]) {
      models[key] = {
        ...models[key],
        ...buildCatalogEntry(change, timestamp, models[key]),
        updatedAt: timestamp
      };
    }
  }

  for (const change of diff.removed) {
    const key = resolveCatalogKey(change);
    if (models[key]) {
      models[key] = {
        ...models[key],
        deprecated: true,
        deprecatedAt: timestamp
      };
    }
  }
}

function buildCatalogEntry(change, timestamp, existing = {}) {
  const model = change && change.model ? change.model : {};
  const provider = change.provider || model.provider || existing.provider || '';
  const catalogKey = resolveCatalogKey(change);

  return {
    ...existing,
    id: normalizeCatalogId(model.id, provider),
    provider,
    displayName: model.displayName || existing.displayName || catalogKey,
    contextTokens: model.contextTokens ?? existing.contextTokens,
    outputTokens: model.outputTokens ?? existing.outputTokens,
    deprecated: model.deprecated ?? existing.deprecated ?? false,
    capabilities: model.capabilities || existing.capabilities || {},
    addedAt: existing.addedAt || timestamp
  };
}

function resolveCatalogKey(change) {
  const model = change && change.model ? change.model : {};
  const provider = change.provider || model.provider || '';
  const modelId = typeof model.id === 'string' ? model.id : '';

  if (modelId.includes('/')) {
    return modelId;
  }

  return provider ? `${provider}/${modelId}` : modelId;
}

function normalizeCatalogId(modelId, provider) {
  const rawId = typeof modelId === 'string' ? modelId : '';
  const prefix = provider ? `${provider}/` : '';
  return prefix && rawId.startsWith(prefix) ? rawId.slice(prefix.length) : rawId;
}

function matchesCatalogEntry(model, change) {
  if (!model || typeof model !== 'object') {
    return false;
  }

  const catalogKey = resolveCatalogKey(change);
  const modelKey = model.id && model.provider
    ? `${model.provider}/${normalizeCatalogId(model.id, model.provider)}`
    : model.id;

  return modelKey === catalogKey || model.id === change.model.id;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertCommandAvailable(command) {
  const pathValue = String(process.env.PATH || '');
  const segments = pathValue.split(path.delimiter).filter(Boolean);
  const extensions = process.platform === 'win32'
    ? String(process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
    : [''];

  for (const directory of segments) {
    for (const extension of extensions) {
      const candidate = path.join(directory, process.platform === 'win32' ? `${command}${extension}` : command);
      try {
        require('fs').accessSync(candidate);
        return;
      } catch {
        // continue searching PATH
      }
    }
  }

  throw new Error(`Required command not found in PATH: ${command}`);
}

function resolveTrustedRepoPath(repoPath) {
  const candidatePath = path.resolve(String(repoPath || process.cwd()));
  const workspaceRoot = path.resolve(process.cwd());

  let realCandidatePath;
  try {
    realCandidatePath = fsSync.realpathSync(candidatePath);
  } catch {
    throw new Error(`invalid repo path: ${candidatePath}`);
  }

  let realWorkspaceRoot;
  try {
    realWorkspaceRoot = fsSync.realpathSync(workspaceRoot);
  } catch {
    realWorkspaceRoot = workspaceRoot;
  }

  if (realCandidatePath !== realWorkspaceRoot && !realCandidatePath.startsWith(`${realWorkspaceRoot}${path.sep}`)) {
    throw new Error(`invalid repo path outside workspace: ${candidatePath}`);
  }

  const gitDirectory = path.join(realCandidatePath, '.git');
  if (!fsSync.existsSync(gitDirectory)) {
    throw new Error(`invalid repo path is not a git repository: ${candidatePath}`);
  }

  return realCandidatePath;
}

module.exports = { PRGenerator, GIT_TIMEOUT_MS };
