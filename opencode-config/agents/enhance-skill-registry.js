#!/usr/bin/env bun

/**
 * Skill Registry Enhancement Script
 * 
 * Adds agent affinity metadata (recommended_agents, compatible_agents) and
 * enhances MCP integration triggers based on agent↔skill↔MCP wiring patterns.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT_DIR = process.cwd().includes('opencode-config') ? join(process.cwd(), '..') : process.cwd();
const CONFIG_DIR = join(ROOT_DIR, 'opencode-config');

// Agent ↔ Skill affinity mappings
const AGENT_SKILL_AFFINITIES = {
  // Core orchestration agents
  'atlas': ['task-orchestrator', 'budget-aware-router', 'skill-orchestrator-runtime', 'context-governor'],
  'sisyphus': ['verification-before-completion', 'finishing-a-development-branch', 'using-git-worktrees', 'code-doctor'],
  'prometheus': ['brainstorming', 'writing-plans', 'writing-skills', 'innovation-migration-planner'],
  'metis': ['systematic-debugging', 'codebase-auditor', 'incident-commander', 'evaluation-harness-builder'],
  
  // Implementation agents
  'hephaestus': ['test-driven-development', 'executing-plans', 'frontend-ui-ux', 'playwright'],
  'oracle': ['sequentialthinking', 'research-builder', 'websearch', 'grep'],
  'librarian': ['context7', 'supermemory', 'websearch', 'research-builder'],
  'momus': ['receiving-code-review', 'requesting-code-review', 'verification-before-completion'],
  
  // Utility agents
  'explore': ['grep', 'websearch', 'playwright', 'dev-browser'],
  'multimodal-looker': ['playwright', 'dev-browser']
};

// MCP ↔ Skill affinity mappings (for trigger enhancement)
const MCP_SKILL_AFFINITIES = {
  'distill': ['budget-aware-router', 'context-governor', 'token-reporter', 'dcp'],
  'context7': ['research-builder', 'writing-plans', 'test-driven-development', 'oracle'],
  'supermemory': ['writing-plans', 'research-builder', 'verification-before-completion', 'prometheus'],
  'sequentialthinking': ['systematic-debugging', 'writing-plans', 'research-builder', 'metis'],
  'playwright': ['dev-browser', 'frontend-ui-ux', 'verification-before-completion', 'hephaestus'],
  'websearch': ['research-builder', 'context7', 'writing-plans', 'librarian'],
  'grep': ['context7', 'research-builder', 'writing-plans', 'oracle'],
  'context-governor': ['budget-aware-router', 'distill', 'token-reporter', 'atlas']
};

function readJSON(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message);
    return null;
  }
}

function enhanceRegistry() {
  console.log('=== Enhancing Skill Registry with Agent Affinities ===\n');
  
  const registryPath = join(CONFIG_DIR, 'skills/registry.json');
  const registry = readJSON(registryPath);
  
  if (!registry || !registry.skills) {
    console.error('No registry found or invalid format');
    return;
  }
  
  const skills = registry.skills;
  const skillNames = Object.keys(skills);
  let enhancedCount = 0;
  let triggerEnhancedCount = 0;
  
  // Enhance each skill with agent affinity
  skillNames.forEach(skillName => {
    const skill = skills[skillName];
    
    // Determine recommended agents based on category and tags
    const recommendedAgents = [];
    const compatibleAgents = [];
    
    // Check each agent's affinity list
    Object.entries(AGENT_SKILL_AFFINITIES).forEach(([agent, affinitySkills]) => {
      if (affinitySkills.includes(skillName)) {
        recommendedAgents.push(agent);
      }
    });
    
    // Fallback: assign based on skill category
    if (recommendedAgents.length === 0) {
      const category = skill.category;
      
      switch(category) {
        case 'optimization':
        case 'meta':
        case 'observability':
          recommendedAgents.push('atlas');
          compatibleAgents.push('sisyphus', 'oracle');
          break;
          
        case 'implementation':
        case 'browser':
        case 'testing':
          recommendedAgents.push('hephaestus');
          compatibleAgents.push('atlas', 'oracle');
          break;
          
        case 'research':
        case 'reasoning':
        case 'analysis':
          recommendedAgents.push('oracle');
          compatibleAgents.push('librarian', 'metis');
          break;
          
        case 'git':
        case 'debugging':
        case 'review':
          recommendedAgents.push('sisyphus');
          compatibleAgents.push('momus', 'metis');
          break;
          
        case 'planning':
        case 'memory':
          recommendedAgents.push('prometheus');
          compatibleAgents.push('metis', 'oracle');
          break;
          
        default:
          recommendedAgents.push('atlas');
          compatibleAgents.push('hephaestus', 'oracle');
      }
    }
    
    // Add agent affinity metadata
    skill.recommended_agents = recommendedAgents;
    skill.compatible_agents = [...new Set(compatibleAgents.filter(agent => !recommendedAgents.includes(agent)))];
    
    // Enhance triggers with MCP references
    const originalTriggers = skill.triggers || [];
    const enhancedTriggers = [...originalTriggers];
    
    Object.entries(MCP_SKILL_AFFINITIES).forEach(([mcp, mcpSkills]) => {
      if (mcpSkills.includes(skillName) && !enhancedTriggers.some(t => t.includes(mcp))) {
        // Add MCP-specific triggers
        switch(mcp) {
          case 'supermemory':
            enhancedTriggers.push(`save to ${mcp}`, `retrieve from ${mcp}`, `${mcp} recall`);
            break;
          case 'sequentialthinking':
            enhancedTriggers.push(`use ${mcp} reasoning`, `${mcp} analysis`, `${mcp} step-by-step`);
            break;
          default:
            enhancedTriggers.push(`use ${mcp}`, `${mcp} tool`, `${mcp} integration`);
        }
      }
    });
    
    if (enhancedTriggers.length > originalTriggers.length) {
      skill.triggers = enhancedTriggers;
      triggerEnhancedCount++;
    }
    
    enhancedCount++;
  });
  
  // Write enhanced registry
  const enhancedRegistry = {
    ...registry,
    skills,
    enhanced_at: new Date().toISOString(),
    enhanced_by: 'enhance-skill-registry.js'
  };
  
  const backupPath = registryPath.replace('.json', '.backup.json');
  writeFileSync(backupPath, JSON.stringify(registry, null, 2));
  writeFileSync(registryPath, JSON.stringify(enhancedRegistry, null, 2));
  
  console.log(`Enhanced ${enhancedCount} skills with agent affinity metadata`);
  console.log(`Enhanced triggers for ${triggerEnhancedCount} skills with MCP references`);
  console.log(`\nBackup saved to: ${backupPath}`);
  console.log(`Enhanced registry saved to: ${registryPath}`);
  
  // Verify enhancement
  const verifyRegistry = readJSON(registryPath);
  const enhancedSkills = verifyRegistry.skills;
  const skillsWithAgents = Object.keys(enhancedSkills).filter(skill => 
    enhancedSkills[skill].recommended_agents && enhancedSkills[skill].recommended_agents.length > 0
  );
  
  console.log(`\nVerification:`);
  console.log(`Skills with agent references: ${skillsWithAgents.length}/${Object.keys(enhancedSkills).length}`);
  
  // Check MCP integration
  const mcpRelatedSkills = Object.keys(enhancedSkills).filter(skill => {
    const skillDef = enhancedSkills[skill];
    const triggers = skillDef.triggers || [];
    return triggers.some(t => 
      t.includes('context7') || 
      t.includes('supermemory') || 
      t.includes('playwright') ||
      t.includes('sequentialthinking') ||
      t.includes('websearch') ||
      t.includes('grep') ||
      t.includes('distill') ||
      t.includes('context-governor')
    );
  });
  
  console.log(`Skills with MCP integration: ${mcpRelatedSkills.length}/${Object.keys(enhancedSkills).length}`);
}

// Run enhancement
if (import.meta.main) {
  enhanceRegistry();
}

export { enhanceRegistry };