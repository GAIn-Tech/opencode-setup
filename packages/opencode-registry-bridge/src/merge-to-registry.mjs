/**
 * registry-bridge/src/merge-to-registry.mjs
 *
 * Merges generated skill entries from generate-entries.mjs output into the
 * live opencode-config/skills/registry.json.
 *
 * SAFETY: This script is IDEMPOTENT and provides a --dry-run option.
 * It only ADDS new entries — it never overwrites existing ones.
 *
 * Usage:
 *   node src/merge-to-registry.mjs              # dry-run (safe preview)
 *   node src/merge-to-registry.mjs --apply      # actually merge
 *   node src/merge-to-registry.mjs --apply --dry-run  # verify what would change
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// packages/opencode-registry-bridge/src → up 3 to reach monorepo root
const ROOT = join(__dirname, '..', '..', '..');
const GENERATED_PATH = join(ROOT, 'opencode-config', 'skills', 'generated', 'generated-skills.json');
const REGISTRY_PATH = join(ROOT, 'opencode-config', 'skills', 'registry.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const apply = args.includes('--apply');

if (!apply && !dryRun) {
  console.error('Usage: node merge-to-registry.mjs [--dry-run] [--apply]');
  console.error('  --dry-run  Preview changes without writing (default)');
  console.error('  --apply    Actually write changes to registry.json');
  process.exit(1);
}

if (apply && dryRun) {
  console.error('Cannot combine --apply and --dry-run');
  process.exit(1);
}

// Load generated entries
if (!existsSync(GENERATED_PATH)) {
  console.error(`Generated file not found: ${GENERATED_PATH}`);
  console.error('Run "bun run generate" or "node src/generate-entries.mjs" first.');
  process.exit(1);
}

const generated = JSON.parse(readFileSync(GENERATED_PATH, 'utf8'));
const newEntries = generated.generated || {};
const generatedAt = generated.generatedAt;

// Load current registry
const registryRaw = readFileSync(REGISTRY_PATH, 'utf8');
const registry = JSON.parse(registryRaw);

const skills = registry.skills || {};
const existingCount = Object.keys(skills).length;

const toAdd = {};
const toSkip = {};
const conflicts = [];

for (const [skillName, entry] of Object.entries(newEntries)) {
  if (skills[skillName]) {
    toSkip[skillName] = {
      reason: 'already exists in registry',
      existing: skills[skillName].description?.slice(0, 60),
      incoming: entry.description?.slice(0, 60),
    };
    conflicts.push(skillName);
  } else {
    toAdd[skillName] = entry;
  }
}

// Display diff
console.log('\n=== Registry Merge Preview ===\n');
console.log(`Generated at: ${generatedAt}`);
console.log(`Existing skills in registry: ${existingCount}`);
console.log(`New entries to add: ${Object.keys(toAdd).length}`);
console.log(`Skipped (already exist): ${Object.keys(toSkip).length}`);

if (Object.keys(toAdd).length) {
  console.log('\n--- New entries to add ---');
  for (const [skill, entry] of Object.entries(toAdd)) {
    console.log(`\n  + ${skill}`);
    console.log(`    description: ${entry.description}`);
    console.log(`    category:   ${entry.category}`);
    console.log(`    triggers:   ${entry.triggers.slice(0, 5).join(', ')}...`);
    console.log(`    synergies:  ${entry.synergies.join(', ') || '(none)'}`);
    console.log(`    inputs:     ${entry.inputs.map(i => i.name).join(', ') || '(none)'}`);
  }
}

if (Object.keys(toSkip).length) {
  console.log('\n--- Skipped (already in registry) ---');
  for (const [skill, info] of Object.entries(toSkip)) {
    console.log(`  ~ ${skill} (${info.reason})`);
  }
}

if (Object.keys(toAdd).length === 0) {
  console.log('\nNo new entries to add. Registry is up to date.');
  process.exit(0);
}

// Apply
if (apply) {
  // Idempotent merge: only add, never overwrite
  for (const [skillName, entry] of Object.entries(toAdd)) {
    skills[skillName] = entry;
  }

  registry.skills = skills;
  registry.lastUpdated = new Date().toISOString();

  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf8');
  console.log(`\n✓ Merged ${Object.keys(toAdd).length} entries into ${REGISTRY_PATH}`);
  console.log(`  Registry now has ${Object.keys(skills).length} skills total.`);
} else {
  console.log('\n[DRY RUN] No changes written. Use --apply to merge.');
  process.exit(0);
}
