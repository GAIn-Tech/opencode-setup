/**
 * DocumentUpdater - Updates documentation and configuration when model hierarchy changes
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class DocumentUpdater {
  constructor(options = {}) {
    this.docsPath = options.docsPath || join(__dirname, '..', '..', 'docs');
    this.configPath = options.configPath || join(__dirname, '..', '..', 'opencode-config');
  }

  /**
   * Update model hierarchy in documentation
   */
  async updateHierarchyDocs(hierarchyChanges) {
    const updates = [];

    for (const [modelId, data] of Object.entries(hierarchyChanges)) {
      const update = await this.updateModelDoc(modelId, data);
      updates.push(update);
    }

    return updates;
  }

  /**
   * Update individual model documentation
   */
  async updateModelDoc(modelId, data) {
    const docPath = join(this.docsPath, 'models', `${modelId}.md`);
    
    const content = this.generateModelDoc(modelId, data);
    
    try {
      await fs.writeFile(docPath, content);
      return { modelId, status: 'updated', path: docPath };
    } catch (error) {
      return { modelId, status: 'error', error: error.message };
    }
  }

  /**
   * Generate model documentation content
   */
  generateModelDoc(modelId, data) {
    return `# Model: ${modelId}

## Hierarchy Level
- **Level**: ${data.level}
- **Confidence**: ${(data.confidence * 100).toFixed(1)}%
- **Reason**: ${data.reason}

## Performance Summary
${data.performance ? `
- Benchmark Score: ${(data.performance.benchmarkScore * 100).toFixed(1)}%
- Latency: ${data.performance.latency}ms
- Reliability: ${(data.performance.reliability * 100).toFixed(1)}%
- Cost: $${data.performance.cost}/1M tokens
` : 'No performance data available'}

## Use Cases
${this.getUseCases(data.level)}

---
*Last updated: ${new Date().toISOString()}*
`;
  }

  getUseCases(level) {
    const useCases = {
      premium: '- Complex reasoning tasks\n- Multi-step problem solving\n- High-stakes code reviews',
      standard: '- General coding tasks\n- Bug fixes\n- Feature implementation',
      economy: '- Simple queries\n- Code generation templates\n- Documentation',
      fallback: '- Last resort requests\n- Model unavailable scenarios'
    };
    return useCases[level] || '- General purpose';
  }

  /**
   * Update hierarchy overview document
   */
  async updateHierarchyOverview(hierarchy) {
    const overviewPath = join(this.docsPath, 'models', 'HIERARCHY.md');
    
    const content = this.generateHierarchyOverview(hierarchy);
    
    try {
      await fs.writeFile(overviewPath, content);
      return { status: 'updated', path: overviewPath };
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }

  /**
   * Generate hierarchy overview content
   */
  generateHierarchyOverview(hierarchy) {
    let content = `# Model Hierarchy

> Last updated: ${new Date().toISOString()}

## Overview

| Level | Models | Description |
|--------|--------|-------------|
`;

    const byLevel = {};
    for (const [modelId, data] of Object.entries(hierarchy)) {
      if (!byLevel[data.level]) {
        byLevel[data.level] = [];
      }
      byLevel[data.level].push(modelId);
    }

    for (const level of ['premium', 'standard', 'economy', 'fallback']) {
      const models = byLevel[level] || [];
      content += `| ${level} | ${models.join(', ') || '-'} | ${this.getLevelDescription(level)} |\n`;
    }

    return content;
  }

  getLevelDescription(level) {
    const descriptions = {
      premium: 'High-complexity, highest quality',
      standard: 'General purpose, balanced',
      economy: 'Cost-sensitive tasks',
      fallback: 'Guaranteed availability'
    };
    return descriptions[level] || '';
  }

  /**
   * Update opencode.json with new hierarchy
   */
  async updateConfigHierarchy(hierarchy) {
    const configPath = join(this.configPath, 'opencode.json');
    
    try {
      const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
      
      // Update hierarchy
      config.models = config.models || {};
      for (const [modelId, data] of Object.entries(hierarchy)) {
        config.models[modelId] = config.models[modelId] || {};
        config.models[modelId].hierarchyLevel = data.level;
      }

      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      return { status: 'updated', path: configPath };
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }

  /**
   * Generate changelog for hierarchy changes
   */
  async generateChangelog(changes) {
    const changelogPath = join(this.docsPath, 'models', 'CHANGELOG.md');
    
    const existing = await fs.readFile(changelogPath, 'utf8').catch(() => '');
    
    const newEntry = this.generateChangelogEntry(changes);
    const content = `${newEntry}\n\n${existing}`.slice(0, 5000);

    await fs.writeFile(changelogPath, content);
    return { status: 'generated', path: changelogPath };
  }

  generateChangelogEntry(changes) {
    const lines = [
      `## ${new Date().toISOString().split('T')[0]}`,
      ''
    ];

    for (const change of changes) {
      const arrow = change.direction === 'promote' ? '↑' : '↓';
      lines.push(`- ${arrow} ${change.modelId}: ${change.currentLevel} → ${change.suggestedLevel} (${change.reason})`);
    }

    return lines.join('\n');
  }
}

export default DocumentUpdater;
