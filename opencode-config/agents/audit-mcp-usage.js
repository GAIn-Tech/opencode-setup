#!/usr/bin/env bun

/**
 * MCP Usage Audit Script
 * 
 * Analyzes actual MCP usage vs configuration to identify:
 * 1. Which MCPs are essential vs optional
 * 2. Usage frequency patterns
 * 3. Conversion difficulty assessment
 * 4. Recommendations for MCP → CLI conversion
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Determine root directory
function getRootDir() {
  const cwd = process.cwd();
  const parts = cwd.split('\\');
  
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i] === 'opencode-setup') {
      return parts.slice(0, i + 1).join('\\');
    }
  }
  
  return cwd;
}

const ROOT_DIR = getRootDir();
const CONFIG_DIR = join(ROOT_DIR, 'opencode-config');

function readJSON(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    return null;
  }
}

function analyzeMCPUsage() {
  console.log('=== MCP Usage Audit ===\n');
  
  // 1. Read MCP configurations
  const toolManifest = readJSON(join(ROOT_DIR, 'mcp-servers', 'tool-manifest.json'));
  const ohMyOpenCode = readJSON(join(CONFIG_DIR, 'oh-my-opencode.json'));
  const skillRegistry = readJSON(join(CONFIG_DIR, 'skills/registry.json'));
  
  if (!toolManifest || !ohMyOpenCode || !skillRegistry) {
    console.error('Error: Missing configuration files');
    return;
  }
  
  const mcpServers = toolManifest.mcp_servers || [];
  const mcpToggles = ohMyOpenCode.mcp || {};
  const skills = skillRegistry.skills || {};
  
  // 2. Categorize MCPs
  console.log('1. MCP Configuration Analysis:');
  
  const enabledByDefault = mcpServers.filter(s => s.enabled !== false);
  const disabledByDefault = mcpServers.filter(s => s.enabled === false);
  
  console.log(`   Enabled by default: ${enabledByDefault.length}`);
  console.log(`   Disabled by default: ${disabledByDefault.length}`);
  console.log(`   Agent toggles enabled: ${Object.values(mcpToggles).filter(t => t.enabled).length}`);
  console.log();
  
  // 3. Analyze skill-MCP integration
  console.log('2. Skill↔MCP Integration:');
  
  const mcpSkillMapping = {};
  enabledByDefault.forEach(server => {
    const name = server.name || 'unknown';
    
    // Special handling for OpenCode-native MCPs with different naming
    const mcpNameVariants = [];
    if (name.startsWith('opencode-')) {
      mcpNameVariants.push(name);
      mcpNameVariants.push(name.replace('opencode-', ''));
    } else {
      mcpNameVariants.push(name);
    }
    
    const relatedSkills = Object.keys(skills).filter(skillName => {
      const skill = skills[skillName];
      const triggers = skill.triggers || [];
      const toolAffinities = skill.tool_affinities || {};
      const description = skill.description || '';
      
      return mcpNameVariants.some(variant => 
        triggers.some(t => t.includes(variant)) || 
        Object.keys(toolAffinities).some(tool => tool.includes(variant)) ||
        description.includes(variant)
      );
    });
    
    mcpSkillMapping[name] = relatedSkills;
  });
  
  Object.entries(mcpSkillMapping).forEach(([mcp, relatedSkills]) => {
    console.log(`   ${mcp}: ${relatedSkills.length} skills`);
    if (relatedSkills.length > 0) {
      console.log(`     ${relatedSkills.slice(0, 3).join(', ')}${relatedSkills.length > 3 ? '...' : ''}`);
    }
  });
  console.log();
  
  // 4. Analyze conversion difficulty
  console.log('3. MCP → CLI Conversion Assessment:');
  
  const conversionAssessment = {
    'grep': {
      difficulty: 'easy',
      reason: 'Simple CLI tool (grep) → can use Bun spawn',
      alternatives: ['bash with grep', 'Node.js readline + regex']
    },
    'github': {
      difficulty: 'easy',
      reason: 'GitHub CLI (gh) already exists',
      alternatives: ['gh CLI tool', 'Octokit REST API']
    },
    'context7': {
      difficulty: 'easy',
      reason: 'HTTP API with structured responses',
      alternatives: ['fetch() + JSON parsing', 'OpenAPI client']
    },
    'distill': {
      difficulty: 'moderate',
      reason: 'AST-based compression requires language parsing',
      alternatives: ['esprima/acorn parser', 'custom AST traversal']
    },
    'sequentialthinking': {
      difficulty: 'moderate',
      reason: 'Stateful conversation management',
      alternatives: ['custom conversation graph', 'session memory store']
    },
    'supermemory': {
      difficulty: 'moderate',
      reason: 'Vector embeddings + semantic search',
      alternatives: ['sqlite + fts5', 'hnswlib-lite', 'simple keyword index']
    },
    'playwright': {
      difficulty: 'hard',
      reason: 'Browser automation with persistent sessions',
      alternatives: ['puppeteer CLI wrapper', 'custom browser controller']
    },
    'context-governor': {
      difficulty: 'hard',
      reason: 'OpenCode-native with deep ecosystem integration',
      alternatives: ['custom token tracker', 'simplified budget estimator']
    },
    'opencode-context-governor': {
      difficulty: 'hard',
      reason: 'OpenCode-native with deep ecosystem integration (budget tracking, session management)',
      alternatives: ['custom token tracker', 'simplified budget estimator']
    },
    'websearch': {
      difficulty: 'hard',
      reason: 'Search + extraction + JavaScript execution',
      alternatives: ['puppeteer + search API', 'multiple specialized tools']
    }
  };
  
  enabledByDefault.forEach(server => {
    const name = server.name || 'unknown';
    const assessment = conversionAssessment[name];
    
    if (assessment) {
      console.log(`   ${name}: ${assessment.difficulty}`);
      console.log(`     Reason: ${assessment.reason}`);
    } else {
      console.log(`   ${name}: unknown (no assessment)`);
    }
  });
  console.log();
  
  // 5. Usage analysis based on skill integration
  console.log('4. Usage Criticality Analysis:');
  
  const criticalMCPs = [];
  const moderateMCPs = [];
  const optionalMCPs = [];
  
  enabledByDefault.forEach(server => {
    const name = server.name || 'unknown';
    const skillCount = mcpSkillMapping[name]?.length || 0;
    const relatedSkills = mcpSkillMapping[name] || [];
    
    // Check if MCP is toggled in oh-my-opencode
    const isToggled = mcpToggles[name]?.enabled === true;
    
    // Critical: High skill integration AND agent toggle
    if (skillCount >= 3 && isToggled) {
      criticalMCPs.push(name);
    }
    // Moderate: Some skill integration
    else if (skillCount >= 1) {
      moderateMCPs.push(name);
    }
    // Optional: No skill integration
    else {
      optionalMCPs.push(name);
    }
  });
  
  console.log(`   Critical (essential): ${criticalMCPs.length}`);
  if (criticalMCPs.length > 0) {
    console.log(`     ${criticalMCPs.join(', ')}`);
  }
  
  console.log(`   Moderate (could be converted): ${moderateMCPs.length}`);
  if (moderateMCPs.length > 0) {
    console.log(`     ${moderateMCPs.join(', ')}`);
  }
  
  console.log(`   Optional (candidates for removal): ${optionalMCPs.length}`);
  if (optionalMCPs.length > 0) {
    console.log(`     ${optionalMCPs.join(', ')}`);
  }
  console.log();
  
  // 6. Recommendations
  console.log('5. Recommendations for MCP → CLI Conversion:');
  
  if (optionalMCPs.length > 0) {
    console.log('   ⚡ IMMEDIATE ACTION: Remove optional MCPs');
    console.log(`     ${optionalMCPs.join(', ')}`);
    console.log('     These have zero skill integration and can be removed without impact.');
  }
  
  const easyToConvert = enabledByDefault
    .map(s => s.name)
    .filter(name => conversionAssessment[name]?.difficulty === 'easy');
    
  if (easyToConvert.length > 0) {
    console.log('\n   🎯 PILOT CONVERSION: Start with easy conversions');
    console.log(`     ${easyToConvert.join(', ')}`);
    console.log('     Use your cli-conversion repo to prototype these first.');
  }
  
  if (criticalMCPs.length > 0) {
    console.log('\n   ⚠️  CRITICAL DEPENDENCIES: High conversion risk');
    console.log(`     ${criticalMCPs.join(', ')}`);
    console.log('     These require careful planning and thorough testing.');
  }
  
  // 7. Conversion strategy
  console.log('\n6. Suggested Conversion Sequence:');
  console.log('   1. Remove optional MCPs (zero skill integration)');
  console.log('   2. Convert easy MCPs (grep, github, context7)');
  console.log('   3. Evaluate effort/benefit after pilot');
  console.log('   4. Decide: Continue full conversion OR adopt hybrid model');
  console.log('   5. If continuing, convert moderate → hard MCPs');
  console.log('   6. Validate with integration tests at each stage');
}

// Run audit
if (import.meta.main) {
  analyzeMCPUsage();
}

export { analyzeMCPUsage };