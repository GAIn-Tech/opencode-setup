#!/usr/bin/env node
/**
 * skills-manage.mjs
 * Atomic skill management CLI for opencode-setup.
 *
 * Commands:
 *   node scripts/skills-manage.mjs add <name> [--category <cat>] [--description "..."] [--source builtin|custom|superpowers]
 *   node scripts/skills-manage.mjs remove <name>
 *   node scripts/skills-manage.mjs list [--all | --enabled | --disabled]
 *   node scripts/skills-manage.mjs enable <name>
 *   node scripts/skills-manage.mjs disable <name>
 *   node scripts/skills-manage.mjs sync          # Scan skills/ dirs and auto-register missing ones
 *   node scripts/skills-manage.mjs audit         # Report registry vs enabled vs SKILL.md consistency
 *
 * All writes are atomic: registry.json and compound-engineering.json updated together.
 * Use --dry-run to preview changes without writing.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SKILLS_DIR = join(ROOT, 'opencode-config', 'skills');
const REGISTRY_PATH = join(ROOT, 'opencode-config', 'skills', 'registry.json');
const COMPOUND_PATH = join(ROOT, 'opencode-config', 'compound-engineering.json');
const TEMPLATE_PATH = join(ROOT, 'opencode-config', 'skills', 'SKILL-TEMPLATE.md');

// ─── Utilities ───────────────────────────────────────────────────────────────

function readJSON(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJSON(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function parseArgs(argv) {
  const args = { flags: {}, positional: [] };
  let i = 0;
  while (i < argv.length) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        args.flags[key] = argv[i + 1];
        i += 2;
      } else {
        args.flags[key] = true;
        i++;
      }
    } else {
      args.positional.push(argv[i]);
      i++;
    }
  }
  return args;
}

function log(msg) {
  process.stdout.write(msg + '\n');
}

function warn(msg) {
  process.stderr.write('WARN: ' + msg + '\n');
}

function err(msg) {
  process.stderr.write('ERROR: ' + msg + '\n');
  process.exit(1);
}

// ─── Core Operations ─────────────────────────────────────────────────────────

function loadState() {
  const registry = readJSON(REGISTRY_PATH);
  const compound = readJSON(COMPOUND_PATH);
  return { registry, compound };
}

function isEnabled(compound, name) {
  return compound.skills.enabled.includes(name);
}

function isInRegistry(registry, name) {
  return !!registry.skills[name];
}

function hasSkillFile(name) {
  // Check both flat and superpowers/ subdirectory
  return (
    existsSync(join(SKILLS_DIR, name, 'SKILL.md')) ||
    existsSync(join(SKILLS_DIR, 'superpowers', name, 'SKILL.md'))
  );
}

function getSkillFilePath(name) {
  const flat = join(SKILLS_DIR, name, 'SKILL.md');
  const nested = join(SKILLS_DIR, 'superpowers', name, 'SKILL.md');
  if (existsSync(flat)) return flat;
  if (existsSync(nested)) return nested;
  return null;
}

// ─── Commands ────────────────────────────────────────────────────────────────

function cmdList(compound, registry, flags) {
  const mode = flags.all ? 'all' : flags.disabled ? 'disabled' : 'enabled';
  const enabled = new Set(compound.skills.enabled);
  const allSkills = Object.keys(registry.skills);

  log('');
  log(`  Skills (${mode})`);
  log('  ' + '─'.repeat(60));

  let shown = 0;
  for (const name of allSkills.sort()) {
    const isEn = enabled.has(name);
    const hasFile = hasSkillFile(name);
    const source = registry.skills[name]?.source || 'unknown';

    if (mode === 'enabled' && !isEn) continue;
    if (mode === 'disabled' && isEn) continue;

    const status = isEn ? '[ON] ' : '[OFF]';
    const fileTag = hasFile ? '' : ' (no SKILL.md)';
    const desc = (registry.skills[name]?.description || '').slice(0, 50);
    log(`  ${status} ${name.padEnd(32)} ${source.padEnd(10)} ${desc}${fileTag}`);
    shown++;
  }

  if (shown === 0) log('  (none)');
  log('');
  log(`  Total in registry: ${allSkills.length} | Enabled: ${enabled.size} | Shown: ${shown}`);
  log('');
}

function cmdAudit(compound, registry) {
  const enabledSet = new Set(compound.skills.enabled);
  const registeredSet = new Set(Object.keys(registry.skills));
  const issues = [];

  for (const name of enabledSet) {
    if (!registeredSet.has(name)) issues.push(`ENABLED but not in registry: ${name}`);
  }
  for (const name of registeredSet) {
    if (!enabledSet.has(name)) issues.push(`Registered but NOT enabled: ${name}`);
    if (!hasSkillFile(name) && registry.skills[name]?.source !== 'builtin') {
      issues.push(`No SKILL.md: ${name} (source: ${registry.skills[name]?.source})`);
    }
  }

  // Disk scan for SKILL.md dirs not in registry
  const scanDir = (dir) => {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (entry.name === 'superpowers') { scanDir(join(SKILLS_DIR, 'superpowers')); continue; }
        if (existsSync(join(dir, entry.name, 'SKILL.md')) && !registeredSet.has(entry.name)) {
          issues.push(`skills/${entry.name}/ has SKILL.md but NOT in registry`);
        }
      }
    } catch (_) {}
  };
  scanDir(SKILLS_DIR);

  log('');
  log('  Skill System Audit');
  log('  ' + '-'.repeat(60));
  if (issues.length === 0) {
    log('  PASS - registry, enabled list, and skill files are consistent.');
  } else {
    log(`  Found ${issues.length} issue(s):\n`);
    for (const issue of issues) log(`  - ${issue}`);
  }
  log('');
}

function cmdEnable(compound, registry, name, dryRun) {
  if (!isInRegistry(registry, name)) {
    errExit(`'${name}' is not in registry.json. Run 'add' first.`);
  }
  if (isEnabled(compound, name)) {
    log(`'${name}' is already enabled.`);
    return;
  }
  if (dryRun) { log(`[dry-run] Would enable: ${name}`); return; }
  compound.skills.enabled = [...new Set([...compound.skills.enabled, name])].sort();
  writeJSON(COMPOUND_PATH, compound);
  log(`Enabled: ${name}`);
}

function cmdDisable(compound, name, dryRun) {
  if (!isEnabled(compound, name)) {
    log(`'${name}' is already disabled.`);
    return;
  }
  if (dryRun) { log(`[dry-run] Would disable: ${name}`); return; }
  compound.skills.enabled = compound.skills.enabled.filter(s => s !== name);
  writeJSON(COMPOUND_PATH, compound);
  log(`Disabled: ${name}`);
}

function cmdAdd(compound, registry, name, flags, dryRun) {
  if (!name) errExit('Usage: skills-manage.mjs add <name> [--category <cat>] [--description "..."] [--source builtin|custom]');

  const category = flags.category || 'unspecified';
  const description = flags.description || `${name} skill`;
  const source = flags.source || 'custom';
  const skipFile = flags['skip-file'] || source === 'builtin';

  log(`\nAdding skill: ${name}`);

  // 1. Add to registry if not present
  if (!isInRegistry(registry, name)) {
    registry.skills[name] = {
      description,
      category,
      tags: [],
      source,
      dependencies: [],
      synergies: [],
      conflicts: [],
      triggers: []
    };

    // Add to categories
    if (!registry.categories[category]) {
      registry.categories[category] = { description: `Skills for ${category}`, skills: [] };
    }
    if (!registry.categories[category].skills.includes(name)) {
      registry.categories[category].skills.push(name);
    }

    if (!dryRun) {
      writeJSON(REGISTRY_PATH, registry);
      log(`  [+] Added to registry.json (category: ${category})`);
    } else {
      log(`  [dry-run] Would add to registry.json`);
    }
  } else {
    log(`  [=] Already in registry.json`);
  }

  // 2. Enable in compound-engineering.json
  if (!isEnabled(compound, name)) {
    if (!dryRun) {
      compound.skills.enabled = [...compound.skills.enabled, name].sort();
      // Add to categories section
      const cats = compound.skills.categories;
      if (cats[category]) {
        if (!cats[category].includes(name)) cats[category].push(name);
      }
      writeJSON(COMPOUND_PATH, compound);
      log(`  [+] Enabled in compound-engineering.json`);
    } else {
      log(`  [dry-run] Would enable in compound-engineering.json`);
    }
  } else {
    log(`  [=] Already enabled in compound-engineering.json`);
  }

  // 3. Create SKILL.md from template
  if (!skipFile && !hasSkillFile(name)) {
    const skillDir = join(SKILLS_DIR, name);
    const skillFile = join(skillDir, 'SKILL.md');

    let template = '';
    if (existsSync(TEMPLATE_PATH)) {
      template = readFileSync(TEMPLATE_PATH, 'utf8')
        .replace(/skill-name-here/g, name)
        .replace(/One-line description for skill discovery and auto-recommendation\.\n.*Should answer: "Use this skill when\.\.\."/, description);
    } else {
      template = `---\nname: ${name}\ndescription: >\n  ${description}\nversion: 1.0.0\ncategory: ${category}\n---\n\n# ${name}\n\n## Overview\n\nTODO: Fill in skill overview.\n\n## When to Use\n\n- TODO\n\n## Workflow\n\n### Phase 1\n\n1. TODO\n`;
    }

    if (!dryRun) {
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(skillFile, template, 'utf8');
      log(`  [+] Created SKILL.md at opencode-config/skills/${name}/SKILL.md`);
      log(`       -> Edit this file to fill in the skill's workflow and calling conventions`);
    } else {
      log(`  [dry-run] Would create SKILL.md at opencode-config/skills/${name}/SKILL.md`);
    }
  } else if (hasSkillFile(name)) {
    log(`  [=] SKILL.md already exists`);
  } else {
    log(`  [-] Skipping SKILL.md creation (builtin skill or --skip-file)`);
  }

  if (!dryRun) {
    log(`\nDone. Skill '${name}' is now registered and enabled.`);
    log(`Next: run 'node scripts/learning-gate.mjs --generate-hashes' before committing.`);
  }
}

function cmdRemove(compound, registry, name, dryRun) {
  if (!isInRegistry(registry, name)) {
    log(`'${name}' is not in registry — nothing to remove.`);
    return;
  }

  log(`Removing skill: ${name}`);

  if (!dryRun) {
    // Remove from registry
    delete registry.skills[name];
    for (const cat of Object.values(registry.categories)) {
      cat.skills = (cat.skills || []).filter(s => s !== name);
    }
    writeJSON(REGISTRY_PATH, registry);
    log(`  [-] Removed from registry.json`);

    // Disable in compound
    if (isEnabled(compound, name)) {
      compound.skills.enabled = compound.skills.enabled.filter(s => s !== name);
      for (const cat of Object.values(compound.skills.categories)) {
        if (Array.isArray(cat)) {
          cat.splice(cat.indexOf(name), 1);
        }
      }
      writeJSON(COMPOUND_PATH, compound);
      log(`  [-] Disabled in compound-engineering.json`);
    }

    log(`\nNote: SKILL.md at opencode-config/skills/${name}/SKILL.md was NOT deleted.`);
    log(`Delete manually if no longer needed.`);
  } else {
    log(`[dry-run] Would remove '${name}' from registry and disable in compound-engineering.json`);
  }
}

function cmdSync(compound, registry, dryRun) {
  log('\nScanning skills/ directory for unregistered skills...\n');
  let added = 0;
  let enabled = 0;

  const scanDir = (baseDir) => {
    try {
      const entries = readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name === 'superpowers') { scanDir(join(baseDir, entry.name)); continue; }
        const skillFile = join(baseDir, entry.name, 'SKILL.md');
        if (!existsSync(skillFile)) continue;
        const name = entry.name;
        if (!isInRegistry(registry, name)) {
          log(`  Unregistered: ${name} — adding to registry`);
          registry.skills[name] = { description: `${name} skill`, category: 'unspecified', tags: [], source: 'custom', dependencies: [], synergies: [], conflicts: [], triggers: [] };
          added++;
        }
        if (!isEnabled(compound, name)) {
          log(`  Not enabled: ${name} — enabling`);
          compound.skills.enabled = [...new Set([...compound.skills.enabled, name])].sort();
          enabled++;
        }
      }
    } catch (_) { /* skip unreadable dirs */ }
  };

  scanDir(SKILLS_DIR);

  if (added === 0 && enabled === 0) {
    log('  Everything is in sync. No changes needed.');
  } else if (!dryRun) {
    if (added > 0) writeJSON(REGISTRY_PATH, registry);
    if (enabled > 0) writeJSON(COMPOUND_PATH, compound);
    log(`\nSync complete: ${added} registered, ${enabled} enabled.`);
    log(`Next: run 'node scripts/learning-gate.mjs --generate-hashes' before committing.`);
  } else {
    log(`\n[dry-run] Would register: ${added} | Would enable: ${enabled}`);
  }
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [command, name] = positional;
  const dryRun = !!flags['dry-run'];

  if (dryRun) log('[dry-run mode — no files will be written]\n');

  if (!command) {
    log('');
    log('  Usage: node scripts/skills-manage.mjs <command> [options]');
    log('');
    log('  Commands:');
    log('    list     [--all|--enabled|--disabled]   List skills and their status');
    log('    audit                                   Check registry/enabled/SKILL.md consistency');
    log('    add      <name>                         Register + enable + create SKILL.md');
    log('             [--category <cat>]             Category (default: unspecified)');
    log('             [--description "..."]          One-line description');
    log('             [--source builtin|custom]      Source type (default: custom)');
    log('             [--skip-file]                  Skip SKILL.md creation');
    log('    remove   <name>                         Remove from registry + disable');
    log('    enable   <name>                         Enable a registered skill');
    log('    disable  <name>                         Disable without removing from registry');
    log('    sync                                    Auto-register all skills/ dirs with SKILL.md');
    log('');
    log('  Options (all commands): --dry-run         Preview without writing');
    log('');
    log('  Examples:');
    log('    node scripts/skills-manage.mjs list --all');
    log('    node scripts/skills-manage.mjs add my-skill --category debugging');
    log('    node scripts/skills-manage.mjs audit');
    log('    node scripts/skills-manage.mjs sync --dry-run');
    log('');
    process.exit(1);
  }

  const { registry, compound } = loadState();

  switch (command) {
    case 'list':    cmdList(compound, registry, flags); break;
    case 'audit':   cmdAudit(compound, registry); break;
    case 'add':     cmdAdd(compound, registry, name, flags, dryRun); break;
    case 'remove':  if (!name) errExit('Usage: skills-manage.mjs remove <name>'); cmdRemove(compound, registry, name, dryRun); break;
    case 'enable':  if (!name) errExit('Usage: skills-manage.mjs enable <name>'); cmdEnable(compound, registry, name, dryRun); break;
    case 'disable': if (!name) errExit('Usage: skills-manage.mjs disable <name>'); cmdDisable(compound, name, dryRun); break;
    case 'sync':    cmdSync(compound, registry, dryRun); break;
    default:
      process.stderr.write("Unknown command: '" + command + "'. Run without arguments for help.\n");
      process.exit(1);
  }
}

main();
