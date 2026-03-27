#!/usr/bin/env bun

// Demo of skill family expansion concept
// Usage: bun .sisyphus/evidence/skill-family-expansion-demo.mjs "workflow-orchestration,git-master"

import { readFileSync } from 'fs';

const registryPath = '.sisyphus/evidence/skill-family-registry.json';
const registry = JSON.parse(readFileSync(registryPath, 'utf8'));

function expandSkillReferences(inputList) {
  const expanded = new Set();
  
  for (const item of inputList) {
    if (registry.families[item]) {
      // Family reference - expand
      for (const skill of registry.families[item].skills) {
        expanded.add(skill);
      }
    } else {
      // Individual skill - add directly
      expanded.add(item);
    }
  }
  
  return Array.from(expanded);
}

// Test cases
const testCases = [
  ["workflow-orchestration"],
  ["context-optimization", "git-master"],
  ["workflow-orchestration", "context-optimization", "writing-plans"],
  ["brainstorming", "executing-plans"] // Individual skills (no expansion)
];

console.log('=== Skill Family Expansion Demo ===\n');
console.log('Registry contains families:', Object.keys(registry.families).join(', '));
console.log('\n');

for (const testCase of testCases) {
  console.log(`Input: task(load_skills=[${testCase.map(s => `"${s}"`).join(', ')}])`);
  const expanded = expandSkillReferences(testCase);
  console.log(`Expands to: [${expanded.map(s => `"${s}"`).join(', ')}]`);
  console.log(`Total skills: ${expanded.length}`);
  console.log('---\n');
}

// Show context-aware candidates
console.log('=== Context-Aware Tier Candidates ===');
console.log('Families with activation_noise_risk: medium');
for (const familyName of registry.contextAwareCandidates) {
  const family = registry.families[familyName];
  console.log(`- ${familyName}: ${family.skills.length} skills, ${family.activation_noise_risk} noise risk`);
}