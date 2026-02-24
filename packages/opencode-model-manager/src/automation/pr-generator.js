'use strict';

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

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
    
    return {
      branch: branchName,
      title: this.generatePRTitle(diff),
      body: prBody,
      timestamp
    };
  }

  /**
   * Create git branch.
   */
  async createBranch(branchName) {
    try {
      execSync(`git checkout -b ${branchName}`, { cwd: this.repoPath });
    } catch (error) {
      throw new Error(`Failed to create branch: ${error.message}`);
    }
  }

  /**
   * Update catalog file with new models.
   */
  async updateCatalog(diff) {
    try {
      // Read current catalog
      const catalogContent = await fs.readFile(this.catalogPath, 'utf-8');
      const catalog = JSON.parse(catalogContent);
      
      // Apply changes
      for (const change of diff.added) {
        if (!catalog.models) catalog.models = [];
        catalog.models.push({
          id: change.model.id,
          provider: change.provider,
          displayName: change.model.displayName || change.model.id,
          contextTokens: change.model.contextTokens,
          outputTokens: change.model.outputTokens,
          deprecated: change.model.deprecated || false,
          capabilities: change.model.capabilities || {},
          addedAt: Date.now()
        });
      }
      
      for (const change of diff.modified) {
        const existingIndex = catalog.models.findIndex(m => m.id === change.model.id);
        if (existingIndex >= 0) {
          catalog.models[existingIndex] = {
            ...catalog.models[existingIndex],
            ...change.model,
            updatedAt: Date.now()
          };
        }
      }
      
      for (const change of diff.removed) {
        const existingIndex = catalog.models.findIndex(m => m.id === change.model.id);
        if (existingIndex >= 0) {
          catalog.models[existingIndex].deprecated = true;
          catalog.models[existingIndex].deprecatedAt = Date.now();
        }
      }
      
      // Update lastUpdated
      catalog.lastUpdated = new Date().toISOString();
      
      // Write back
      await fs.writeFile(
        this.catalogPath,
        JSON.stringify(catalog, null, 2) + '\n',
        'utf-8'
      );
    } catch (error) {
      throw new Error(`Failed to update catalog: ${error.message}`);
    }
  }

  /**
   * Commit changes.
   */
  async commitChanges(diff, branchName) {
    try {
      execSync('git add opencode-config/models/catalog-2026.json', { cwd: this.repoPath });
      
      const commitMessage = this.generateCommitMessage(diff);
      execSync(`git commit -m "${commitMessage}"`, { cwd: this.repoPath });
    } catch (error) {
      throw new Error(`Failed to commit changes: ${error.message}`);
    }
  }

  /**
   * Push branch to remote.
   */
  async pushBranch(branchName) {
    try {
      execSync(`git push -u origin ${branchName}`, { cwd: this.repoPath });
    } catch (error) {
      throw new Error(`Failed to push branch: ${error.message}`);
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

module.exports = { PRGenerator };
