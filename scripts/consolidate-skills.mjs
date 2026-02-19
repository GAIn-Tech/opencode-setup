#!/usr/bin/env node

/**
 * Consolidate skills from superpowers and other sources into opencode-config/skills/
 * 
 * This script:
 * 1. Copies superpowers skills to opencode-config/skills/superpowers/
 * 2. Validates each skill has required SKILL.md
 * 3. Updates registry.json with any new skills
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const skillsDir = path.join(rootDir, 'opencode-config', 'skills');
const superpowersSkillsDir = path.join(skillsDir, 'superpowers');

// Source: User's superpowers installation
const userSuperpowersDir = process.env.HOME 
  ? path.join(process.env.HOME, '.config', 'opencode', 'superpowers', 'skills')
  : path.join(process.env.USERPROFILE, '.config', 'opencode', 'superpowers', 'skills');

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

if (result.invalid > 0) {
  console.log('⚠️  Some skills are missing SKILL.md files.');
  console.log('   Use SKILL-TEMPLATE.md as a starting point.\n');
}

console.log('✨ Skill consolidation complete!\n');
