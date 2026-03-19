/**
 * preload-state-persist.mjs — RL tier override persistence for PreloadSkillsPlugin
 * 
 * The PreloadSkillsPlugin tracks RL-driven promotions/demotions in-memory via
 * TierResolver._tierOverrides. This script persists those overrides to
 * tool-tiers.json rl_overrides section so they survive plugin restarts.
 * 
 * Architecture:
 *   Runtime: PreloadSkillsPlugin._tierOverrides (in-memory, per-session)
 *   Persistence: opencode-config/tool-tiers.json rl_overrides (cross-session)
 *   Bridge: This script — syncs in-memory state ↔ disk
 * 
 * Session lifecycle wiring (in oh-my-opencode plugin lifecycle):
 *   - On session START: call with --import  (load overrides into plugin)
 *   - On session END:   call with --export  (save overrides to disk)
 *   - During governance:  call with --sync     (bidirectional sync)
 * 
 * Usage:
 *   bun run scripts/preload-state-persist.mjs --export  # save overrides to disk
 *   bun run scripts/preload-state-persist.mjs --import  # load overrides from disk
 *   bun run scripts/preload-state-persist.mjs --sync    # show diff, no changes
 *   bun run scripts/preload-state-persist.mjs --dry-run # preview changes
 *   bun run scripts/preload-state-persist.mjs --apply  # apply overrides to tool-tiers.json
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = resolve(__dirname, '../.opencode/preload-state.json');
const TIERS_FILE = resolve(__dirname, '../opencode-config/tool-tiers.json');

const tiers = JSON.parse(readFileSync(TIERS_FILE, 'utf-8'));
const rl = tiers.rl_overrides || {};

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const apply = args.includes('--apply');

// Load state file if it exists
let state = { overrides: {}, usageStats: {}, stats: {}, tierOverrides: {} };
if (existsSync(STATE_FILE)) {
  try {
    state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  } catch (e) {
    console.warn(`Warning: could not parse state file: ${e.message}`);
  }
}

// Normalize overrides from various formats
function normalizeOverrides(raw) {
  const result = { promotions: {}, demotions: {} };
  if (!raw) return result;
  
  for (const [skill, meta] of Object.entries(raw)) {
    if (!meta || typeof meta !== 'object') continue;
    if (meta.tier === 1 || (meta.promotedAt && !meta.demotedAt)) {
      result.promotions[skill] = {
        taskTypes: meta.taskTypes || [],
        promotedAt: meta.promotedAt || null,
        reason: meta.reason || 'manual',
      };
    } else if (meta.tier === 2 || meta.demotedAt) {
      result.demotions[skill] = {
        demotedAt: meta.demotedAt || null,
        reason: meta.reason || 'manual',
      };
    }
  }
  return result;
}

// Read overrides from state file (tierOverrides or overrides key)
const raw = state.tierOverrides || state.overrides || {};
const { promotions, demotions } = normalizeOverrides(raw);

// Current disk state
const diskPromotions = rl.promotions || {};
const diskDemotions = rl.demotions || {};

function summarize(obj) {
  const entries = Object.entries(obj);
  if (entries.length === 0) return '  (none)';
  return entries.map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`).join('\n');
}

if (args.includes('--export')) {
  // Export in-memory overrides → disk (tool-tiers.json)
  const now = new Date().toISOString();
  const merged = {
    ...rl,
    promotions: { ...diskPromotions, ...promotions },
    demotions: { ...diskDemotions, ...demotions },
    last_updated: now,
  };
  
  if (dryRun) {
    console.log('Would write to tool-tiers.json rl_overrides:');
    console.log('  promotions:', Object.keys(merged.promotions).join(', ') || '(none)');
    console.log('  demotions:', Object.keys(merged.demotions).join(', ') || '(none)');
  } else {
    tiers.rl_overrides = merged;
    writeFileSync(TIERS_FILE, JSON.stringify(tiers, null, 2) + '\n', 'utf-8');
    console.log(`Exported ${Object.keys(promotions).length} promotions, ${Object.keys(demotions).length} demotions to tool-tiers.json`);
    console.log(`Updated rl_overrides.last_updated = ${now}`);
    
    // Optionally clear the state file (prevent double-export on next run)
    if (args.includes('--clear')) {
      writeFileSync(STATE_FILE, JSON.stringify({ overrides: {}, usageStats: {}, stats: {}, tierOverrides: {} }, null, 2) + '\n', 'utf-8');
      console.log('Cleared state file.');
    }
  }
} else if (args.includes('--import')) {
  // Import disk overrides → in-memory format (for PreloadSkillsPlugin)
  const result = { promotions: diskPromotions, demotions: diskDemotions };
  if (apply) {
    // Write as PreloadSkillsPlugin state file
    writeFileSync(STATE_FILE, JSON.stringify({ ...state, tierOverrides: result }, null, 2) + '\n', 'utf-8');
    console.log(`Imported ${Object.keys(diskPromotions).length} promotions, ${Object.keys(diskDemotions).length} demotions to state file`);
  } else {
    console.log('Disk rl_overrides from tool-tiers.json:');
    console.log('Promotions:\n' + summarize(diskPromotions));
    console.log('Demotions:\n' + summarize(diskDemotions));
    if (Object.keys(diskPromotions).length === 0 && Object.keys(diskDemotions).length === 0) {
      console.log('\nNo RL overrides on disk. Run --export to persist in-memory state, or manually add entries to rl_overrides in tool-tiers.json.');
    }
  }
} else if (args.includes('--sync')) {
  // Show diff between disk and state file
  const stateKeys = new Set([...Object.keys(promotions), ...Object.keys(demotions)]);
  const diskKeys = new Set([...Object.keys(diskPromotions), ...Object.keys(diskDemotions)]);
  
  const onlyInState = [...stateKeys].filter(k => !diskKeys.has(k));
  const onlyOnDisk = [...diskKeys].filter(k => !stateKeys.has(k));
  const inBoth = [...stateKeys].filter(k => diskKeys.has(k));
  
  console.log('RL override sync report:');
  console.log(`  In state file only (need --export): ${onlyInState.length}`);
  onlyInState.forEach(k => console.log(`    + ${k}`));
  console.log(`  On disk only (need --import): ${onlyOnDisk.length}`);
  onlyOnDisk.forEach(k => console.log(`    - ${k}`));
  console.log(`  In both (synced): ${inBoth.length}`);
  inBoth.forEach(k => console.log(`    = ${k}`));
  console.log(`\nState file: ${STATE_FILE}`);
  console.log(`Tiers file: ${TIERS_FILE}`);
} else {
  // Default: show both
  console.log('RL Tier Override Status');
  console.log('========================');
  console.log('\nState file (' + STATE_FILE + '):');
  const { promotions: sp, demotions: sd } = normalizeOverrides(raw);
  console.log('Promotions:\n' + summarize(sp));
  console.log('Demotions:\n' + summarize(sd));
  console.log('\nDisk (tool-tiers.json rl_overrides):');
  console.log('Promotions:\n' + summarize(diskPromotions));
  console.log('Demotions:\n' + summarize(diskDemotions));
  console.log('\nUsage: --export | --import | --sync | --dry-run | --apply');
  console.log('  --export  Persist state file → tool-tiers.json');
  console.log('  --import  Load disk → state file');
  console.log('  --sync    Show diff between state file and disk');
  console.log('  --dry-run Preview --export without writing');
  console.log('  --apply   Write changes (use with --export or --import)');
  console.log('  --clear   Clear state file after export');
}
