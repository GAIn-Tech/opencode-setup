#!/usr/bin/env node

/**
 * Consolidate skills from superpowers and other sources into opencode-config/skills/
 * 
 * This script:
 * 1. Copies superpowers skills to opencode-config/skills/superpowers/
 * 2. Validates each skill has required SKILL.md
 * 3. Updates registry.json with any new skills (registry-aware mode)
 * 
 * Usage: node consolidate-skills.mjs [--sync-registry]
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseFrontmatter } from './lib/yaml-frontmatter-parser.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const skillsDir = path.join(rootDir, 'opencode-config', 'skills');
const superpowersSkillsDir = path.join(skillsDir, 'superpowers');
const registryPath = path.join(skillsDir, 'registry.json');

// Source: User's superpowers installation
const userSuperpowersDir = process.env.HOME 
  ? path.join(process.env.HOME, '.config', 'opencode', 'superpowers', 'skills')
  : path.join(process.env.USERPROFILE, '.config', 'opencode', 'superpowers', 'skills');

const SYNC_REGISTRY = process.argv.includes('--sync-registry');

console.log('🔄 Consolidating skills...\n');

// Load or initialize registry
function loadRegistry() {
  if (fs.existsSync(registryPath)) {
    return JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
  }
  return { version: '1.0.0', lastUpdated: new Date().toISOString(), skills: {}, profiles: {}, categories: {} };
}

function saveRegistry(registry) {
  registry.lastUpdated = new Date().toISOString();
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n');
}

// Extract skill metadata from SKILL.md frontmatter
function extractSkillMetadata(skillDir) {
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) return null;
  
  const content = fs.readFileSync(skillMdPath, 'utf-8');
  
  // Parse YAML frontmatter using robust js-yaml parser
  const metadata = parseFrontmatter(content) || {};
  if (!metadata || Object.keys(metadata).length === 0) return null;
  
  // Extract triggers from "When to Use" section
  const whenToUseMatch = content.match(/## When to Use\n\nUse this skill when:\n([\s\S]*?)\n\nDo NOT use/m);
  if (whenToUseMatch) {
    const triggers = whenToUseMatch[1]
      .split('\n')
      .filter(line => line.trim().startsWith('- '))
      .map(line => line.trim().substring(2));
    metadata.triggers = triggers;
  }
  
  return metadata;
}

// Sync a single skill to registry
function syncSkillToRegistry(registry, skillName, metadata, source = 'custom') {
  if (!metadata || !metadata.name) return false;
  
  if (!registry.skills[skillName]) {
    console.log(`   📝 Adding ${skillName} to registry`);
    registry.skills[skillName] = {
      description: metadata.description || `Skill: ${skillName}`,
      category: metadata.category || 'implementation',
      tags: metadata.tags || [],
      source: source,
      dependencies: metadata.dependencies || [],
      synergies: metadata.synergies || [],
      conflicts: metadata.conflicts || [],
      triggers: metadata.triggers || []
    };
    return true;
  } else {
    // Update existing entry
    registry.skills[skillName].description = metadata.description || registry.skills[skillName].description;
    registry.skills[skillName].tags = [...new Set([...registry.skills[skillName].tags, ...(metadata.tags || [])])];
    registry.skills[skillName].synergies = [...new Set([...registry.skills[skillName].synergies, ...(metadata.synergies || [])])];
    return false;
  }
}

console.log('🔄 Consolidating skills...\n');

// Create superpowers directory if needed
if (!fs.existsSync(superpowersSkillsDir)) {
  fs.mkdirSync(superpowersSkillsDir, { recursive: true });
  console.log(`📁 Created ${superpowersSkillsDir}`);
}

// Check if superpowers source exists
if (!fs.existsSync(userSuperpowersDir)) {
  console.log(`⚠️  Superpowers not found at ${userSuperpowersDir}`);
  console.log('   Skipping superpowers consolidation.\n');
} else {
  // Get list of superpowers skills
  const superpowersSkills = fs.readdirSync(userSuperpowersDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  
  console.log(`📦 Found ${superpowersSkills.length} superpowers skills:`);
  
  for (const skill of superpowersSkills) {
    const srcDir = path.join(userSuperpowersDir, skill);
    const destDir = path.join(superpowersSkillsDir, skill);
    
    // Check for SKILL.md
    const skillMdPath = path.join(srcDir, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) {
      console.log(`   ⚠️  ${skill}: Missing SKILL.md, skipping`);
      continue;
    }
    
    // Copy skill directory
    if (fs.existsSync(destDir)) {
      fs.rmSync(destDir, { recursive: true });
    }
    fs.cpSync(srcDir, destDir, { recursive: true });
    console.log(`   ✅ ${skill}`);
  }
}

// Validate all skills in opencode-config/skills/
console.log('\n🔍 Validating all skills...\n');

function validateSkillDir(dir, prefix = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let valid = 0;
  let invalid = 0;
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    if (entry.name === 'superpowers') {
      // Recurse into superpowers
      const result = validateSkillDir(path.join(dir, entry.name), 'superpowers/');
      valid += result.valid;
      invalid += result.invalid;
      continue;
    }
    
    const skillPath = path.join(dir, entry.name);
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    
    if (fs.existsSync(skillMdPath)) {
      console.log(`   ✅ ${prefix}${entry.name}`);
      valid++;
    } else {
      console.log(`   ❌ ${prefix}${entry.name}: Missing SKILL.md`);
      invalid++;
    }
  }
  
  return { valid, invalid };
}

const result = validateSkillDir(skillsDir);

console.log(`\n📊 Summary: ${result.valid} valid, ${result.invalid} invalid\n`);

// Registry-aware sync mode
if (SYNC_REGISTRY) {
  console.log('📋 Syncing with registry...\n');
  let registry = loadRegistry();
  let registryUpdated = false;
  
  // Scan all skills directories
  const skillDirs = [];
  
  // Add superpowers subdirectories
  const superpowersPath = path.join(skillsDir, 'superpowers');
  if (fs.existsSync(superpowersPath)) {
    for (const dir of fs.readdirSync(superpowersPath, { withFileTypes: true })) {
      if (dir.isDirectory()) {
        skillDirs.push({ base: 'superpowers', skill: dir.name });
      }
    }
  }
  
  // Add top-level skill directories
  for (const dir of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (dir.isDirectory() && !dir.name.startsWith('.') && dir.name !== 'superpowers') {
      skillDirs.push({ base: dir.name, skill: dir.name });
    }
  }
  
  for (const { base, skill } of skillDirs) {
    const skillPath = path.join(skillsDir, base, skill);
    if (!fs.existsSync(skillPath) || !fs.statSync(skillPath).isDirectory()) continue;
    
    const metadata = extractSkillMetadata(skillPath);
    if (metadata) {
      const source = base === 'superpowers' ? 'superpowers' : 'custom';
      if (syncSkillToRegistry(registry, skill, metadata, source)) {
        registryUpdated = true;
      }
    }
  }
  
  if (registryUpdated) {
    saveRegistry(registry);
    console.log('✅ Registry updated\n');
  } else {
    console.log('ℹ️  Registry up to date\n');
  }
}

if (result.invalid > 0) {
  console.log('⚠️  Some skills are missing SKILL.md files.');
  console.log('   Use SKILL-TEMPLATE.md as a starting point.\n');
}

console.log('✨ Skill consolidation complete!\n');
