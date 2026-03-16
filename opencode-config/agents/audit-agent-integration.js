#!/usr/bin/env bun

/**
 * Agent Integration Audit Script
 * 
 * Verifies that all agents, skills, and MCPs are properly integrated
 * according to the analysis findings.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Determine root directory
function getRootDir() {
  const cwd = process.cwd();
  const parts = cwd.split('\\');
  
  // Find the index of 'opencode-setup' or 'opencode-config'
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i] === 'opencode-setup') {
      return parts.slice(0, i + 1).join('\\');
    }
  }
  
  // If we're inside opencode-config but can't find opencode-setup
  if (parts.includes('opencode-config')) {
    const configIndex = parts.indexOf('opencode-config');
    return parts.slice(0, configIndex).join('\\');
  }
  
  return cwd;
}

const ROOT_DIR = getRootDir();
const CONFIG_DIR = join(ROOT_DIR, 'opencode-config');

function readJSON(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message);
    return null;
  }
}

function auditAgents() {
  console.log('=== Agent Integration Audit ===\n');
  
  // 1. Check agent definitions
  const ohMyOpenCode = readJSON(join(CONFIG_DIR, 'oh-my-opencode.json'));
  if (!ohMyOpenCode) return;
  
  console.log('1. Agent Configuration:');
  const enabledAgents = ohMyOpenCode.agents?.enabled || [];
  console.log(`   Enabled agents: ${enabledAgents.length}`);
  enabledAgents.forEach(agent => {
    const model = ohMyOpenCode.agents?.[agent]?.model || 'unknown';
    console.log(`   - ${agent}: ${model}`);
  });
  console.log();
  
  // 2. Check skill registry
  const skillRegistry = readJSON(join(CONFIG_DIR, 'skills/registry.json'));
  if (!skillRegistry) return;
  
  const skills = skillRegistry.skills || {};
  const enabledSkills = Object.keys(skills);
  console.log('2. Skill Registry:');
  console.log(`   Registered skills: ${enabledSkills.length}`);
  
  // Count skills by category
  const skillCategories = {};
  enabledSkills.forEach(skill => {
    const category = skills[skill]?.category || 'uncategorized';
    skillCategories[category] = (skillCategories[category] || 0) + 1;
  });
  
  Object.entries(skillCategories).forEach(([category, count]) => {
    console.log(`   - ${category}: ${count} skills`);
  });
  console.log();
  
  // 3. Check MCP configurations
  const toolManifest = readJSON(join(ROOT_DIR, 'mcp-servers', 'tool-manifest.json'));
  const mcpConfig = readJSON(join(ROOT_DIR, 'mcp-servers', 'opencode-mcp-config.json'));
  
  console.log('3. MCP Server Status:');
  
  // Get MCPs from tool-manifest.json (comprehensive registry)
  const mcpServers = toolManifest?.mcp_servers || [];
  
  // Categorize MCPs
  const activeMCPs = [];
  const dormantMCPs = [];
  const opencodeNativeMCPs = [];
  const externalMCPs = [];
  
  mcpServers.forEach(server => {
    const name = server.name || 'unknown';
    const enabled = server.enabled !== false;
    const isOpencodeNative = server.name?.startsWith('opencode-') || 
                           ['dashboard-launcher', 'memory-graph', 'model-router-x', 'context-governor', 'runbooks'].includes(name);
    
    if (enabled) {
      activeMCPs.push(name);
      if (isOpencodeNative) {
        opencodeNativeMCPs.push(name);
      } else {
        externalMCPs.push(name);
      }
    } else {
      dormantMCPs.push(name);
    }
  });
  
  console.log(`   Active MCPs: ${activeMCPs.length}`);
  console.log(`     OpenCode native: ${opencodeNativeMCPs.length}`);
  opencodeNativeMCPs.forEach(mcp => console.log(`       - ${mcp}`));
  console.log(`     External: ${externalMCPs.length}`);
  externalMCPs.forEach(mcp => console.log(`       - ${mcp}`));
  
  console.log(`   Dormant MCPs: ${dormantMCPs.length}`);
  dormantMCPs.forEach(mcp => console.log(`   - ${mcp}`));
  console.log();
  
  // Check oh-my-openable MCP toggles
  const enabledMCPToggles = ohMyOpenCode?.mcp || {};
  const enabledMCPsFromToggle = Object.keys(enabledMCPToggles).filter(mcp => enabledMCPToggles[mcp]?.enabled);
  console.log(`   Enabled via oh-my-opencode: ${enabledMCPsFromToggle.length}`);
  enabledMCPsFromToggle.forEach(mcp => console.log(`   - ${mcp}`));
  console.log();
  
  // 4. Integration assessment
  console.log('4. Integration Assessment:');
  
  // Agent ↔ Skill wiring check
  const skillsWithAgentRefs = enabledSkills.filter(skill => {
    const skillDef = skills[skill];
    return skillDef?.recommended_agents || skillDef?.compatible_agents;
  });
  
  console.log(`   Skills with agent references: ${skillsWithAgentRefs.length}/${enabledSkills.length}`);
  
  // MCP ↔ Skill wiring check  
  // Check for skills that reference MCPs in triggers or have tool affinities
  const mcpRelatedSkills = enabledSkills.filter(skill => {
    const skillDef = skills[skill];
    const triggers = skillDef?.triggers || [];
    
    // Check if triggers mention MCPs
    const mcpTriggers = triggers.some(trigger => 
      trigger.includes('context7') || 
      trigger.includes('supermemory') || 
      trigger.includes('playwright') ||
      trigger.includes('sequentialthinking') ||
      trigger.includes('websearch') ||
      trigger.includes('grep') ||
      trigger.includes('distill')
    );
    
    return mcpTriggers || (skillDef?.tool_affinities && Object.keys(skillDef.tool_affinities).length > 0);
  });
  
  console.log(`   Skills with MCP integration: ${mcpRelatedSkills.length}/${enabledSkills.length}`);
  
  // 5. Recommendations
  console.log('\n5. Recommendations:');
  
  // Check for local agent prompts
  const agentsDir = join(CONFIG_DIR, 'agents');
  const localAgentMirror = readJSON(join(agentsDir, 'local-agent-mirror.json'));
  const hasAgentPrompts = localAgentMirror && localAgentMirror.agents && Object.keys(localAgentMirror.agents).length > 0;
  
  if (!hasAgentPrompts) {
    console.log('   ⚠️  Missing local agent prompts (external dependency on oh-my-opencode)');
    console.log('   Recommendation: Create local mirror of agent prompts for auditability');
  } else {
    console.log('   ✅ Local agent mirror available');
    console.log(`   Agent definitions mirrored: ${Object.keys(localAgentMirror.agents).length}`);
  }
  
// Check passive MCP utilization
  const passiveMCPs = ['supermemory', 'sequentialthinking'];
  const underutilized = passiveMCPs.filter(mcp =>
    !mcpRelatedSkills.some(skill => {
      const skillDef = skills[skill];
      const triggers = skillDef?.triggers || [];
      return triggers.some(trigger => trigger.includes(mcp));
    })
  );
  
  if (underutilized.length > 0) {
    console.log(`   ⚠️  Underutilized passive MCPs: ${underutilized.join(', ')}`);
    console.log('   Recommendation: Improve auto-triggering in skill definitions');
  }
  
  // Check dormant MCP monitoring
  if (dormantMCPs.length > 0) {
    console.log(`   ⚠️  Dormant MCPs without monitoring: ${dormantMCPs.join(', ')}`);
    console.log('   Recommendation: Implement automated reactivation criteria checking');
  }
  
  // Calculate integration score
  let score = 85; // Base score from analysis
  
  if (!hasAgentPrompts) score -= 10;
  if (underutilized.length > 0) score -= 5;
  if (dormantMCPs.length > 0) score -= 5;
  if (skillsWithAgentRefs.length / enabledSkills.length < 0.5) score -= 5;
  if (mcpRelatedSkills.length / enabledSkills.length < 0.3) score -= 5;
  
  console.log(`\nIntegration Score: ${score}/100`);
  
  if (score >= 90) {
    console.log('Status: ✅ Excellent integration');
  } else if (score >= 80) {
    console.log('Status: ⚠️  Good integration with some gaps');
  } else {
    console.log('Status: ❌ Integration needs improvement');
  }
}

// Run audit
if (import.meta.main) {
  auditAgents();
}

export { auditAgents };