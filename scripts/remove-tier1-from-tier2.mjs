/**
 * Remove tier_1 skills from tier_2 in tool-tiers.json.
 * These skills are pre-loaded via tier_1 categories — listing them in tier_2
 * wastes system-prompt tokens (they appear in load_skill description redundantly).
 * The _dedup() prevents double-loading, but the tier_2 listing is pure waste.
 */
import { readFileSync, writeFileSync } from 'fs';

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const TIERS_PATH = resolve(__dirname, '../opencode-config/tool-tiers.json');

const tiers = JSON.parse(readFileSync(TIERS_PATH, 'utf-8'));

// Skills pre-loaded by tier_1 categories (all 19 unique skills across 17 categories)
const TIER1_SKILLS = new Set([
  'brainstorming',
  'systematic-debugging',
  'test-driven-development',
  'evaluation-harness-builder',
  'sequentialthinking',
  'frontend-ui-ux',
  'playwright',
  'git-master',
  'supermemory',
  'dev-browser',
  'writing-plans',
  'context-governor',
  'budget-aware-router',
  'receiving-code-review',
  'requesting-code-review',
  'codebase-auditor',
  'incident-commander',
  'innovation-migration-planner',
  'writing-skills',
  'beads',
]);

const tier2 = tiers.tier_2?.skills;
if (!tier2) {
  console.error('No tier_2.skills found');
  process.exit(1);
}

const before = Object.keys(tier2).length;
const removed = [];

for (const skill of TIER1_SKILLS) {
  if (tier2[skill]) {
    delete tier2[skill];
    removed.push(skill);
  }
}

const after = Object.keys(tier2).length;
console.log(`Removed ${removed.length} tier_1 skills from tier_2:`);
removed.forEach(s => console.log(`  - ${s}`));
console.log(`\ntier_2 count: ${before} → ${after}`);

writeFileSync(TIERS_PATH, JSON.stringify(tiers, null, 2) + '\n', 'utf-8');
console.log('Written to tool-tiers.json');
