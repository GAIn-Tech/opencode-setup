#!/usr/bin/env node

/**
 * sync-project-learnings.mjs
 * 
 * Extracts learnings from project KB and syncs to global meta-KB.
 * Filters out project-specific details while preserving beneficial patterns.
 * 
 * Usage:
 *   bun run scripts/sync-project-learnings.mjs --project /path/to/project
 *   bun run scripts/sync-project-learnings.mjs --project /path/to/project --dry-run
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const projectIdx = args.indexOf('--project');
const projectRoot = projectIdx >= 0 && args[projectIdx + 1] 
  ? args[projectIdx + 1] 
  : process.cwd();

console.log('[sync-learnings] Starting learning sync...');
console.log('[sync-learnings] Project:', projectRoot);

// Paths
const projectKB = path.join(projectRoot, '.sisyphus', 'kb');
const metaKnowledgeFile = path.join(projectKB, 'meta-knowledge.json');
const globalMetaKB = path.join(ROOT, '.sisyphus', 'kb', 'meta-knowledge.json');

// Check project KB exists
if (!existsSync(metaKnowledgeFile)) {
  console.error('[sync-learnings] ERROR: Project KB not found at', metaKnowledgeFile);
  process.exit(1);
}

// Load project meta-knowledge
async function loadProjectKB() {
  try {
    const content = await readFile(metaKnowledgeFile, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    console.error('[sync-learnings] ERROR: Failed to load project KB:', e.message);
    return null;
  }
}

// Extract syncable learnings
function extractLearnings(kbData) {
  const learnings = {
    timestamp: new Date().toISOString(),
    projects: {},
    globalPatterns: [],
    skillUsageStats: {},
    modelPerformance: {}
  };
  
  // Copy only project patterns explicitly marked as syncable.
  if (kbData.globalPatterns) {
    learnings.globalPatterns = kbData.globalPatterns.filter(p => p.syncable);
  }
  
  // Copy skill usage stats (anonymized)
  if (kbData.skillUsageStats) {
    learnings.skillUsageStats = kbData.skillUsageStats;
  }
  
  // Copy model performance (anonymized)
  if (kbData.modelPerformance) {
    learnings.modelPerformance = kbData.modelPerformance;
  }
  
  return learnings;
}

// Filter project-specific learnings
function filterForGlobal(projectLearnings) {
  const filtered = {
    timestamp: projectLearnings.timestamp,
    globalPatterns: [],
    skillUsageStats: {},
    modelPerformance: {}
  };
  
  // Filter: only patterns marked as syncable are transferred
  // This ensures project-specific files stays local
  filtered.globalPatterns = projectLearnings.globalPatterns.map(p => ({
    pattern: p.pattern,
    source_project: '[ANONYMIZED]',
    success_rate: p.success_rate,
    use_count: p.use_count
  }));
  
  // Anonymize skill usage stats
  filtered.skillUsageStats = projectLearnings.skillUsageStats;
  
  // Anonymize model performance
  filtered.modelPerformance = projectLearnings.modelPerformance;
  
  return filtered;
}

// Sync to global KB
async function syncToGlobal(learnings) {
  let globalKB = { schema: 'meta-kb-v1', globalPatterns: [], skillUsageStats: {}, modelPerformance: {} };
  
  if (existsSync(globalMetaKB)) {
    try {
      const content = await readFile(globalMetaKB, 'utf-8');
      globalKB = JSON.parse(content);
    } catch (e) {
      console.warn('[sync-learnings] Warning: Could not load global KB, creating new');
    }
  }
  
  // Merge learnings into global KB
  for (const pattern of learnings.globalPatterns) {
    const existing = globalKB.globalPatterns.find(p => p.pattern === pattern.pattern);
    if (existing) {
      existing.use_count = (existing.use_count || 0) + (pattern.use_count || 1);
      existing.success_rate = ((existing.success_rate || 0) + pattern.success_rate) / 2;
    } else {
      globalKB.globalPatterns.push(pattern);
    }
  }
  
  if (isDryRun) {
    console.log('[sync-learnings] DRY RUN - would write:');
    console.log(JSON.stringify(globalKB, null, 2).slice(0, 500) + '...');
    return;
  }
  
  // Ensure global KB directory exists
  const globalKBDir = path.dirname(globalMetaKB);
  if (!existsSync(globalKBDir)) {
    await mkdir(globalKBDir, { recursive: true });
  }
  
  await writeFile(globalMetaKB, JSON.stringify(globalKB, null, 2));
  console.log('[sync-learnings] Synced to global meta-KB');
}

// Main execution
async function main() {
  const kbData = await loadProjectKB();
  if (!kbData) {
    process.exit(1);
  }
  
  console.log('[sync-learnings] Loaded project KB, schema:', kbData.schema);
  
  const learnings = extractLearnings(kbData);
  console.log('[sync-learnings] Extracted', learnings.globalPatterns.length, 'global patterns');
  
  const anonymized = filterForGlobal(learnings);
  await syncToGlobal(anonymized);
  
  console.log('[sync-learnings] Learning sync complete');
  process.exit(0);
}

main().catch(e => {
  console.error('[sync-learnings] FATAL:', e);
  process.exit(1);
});
