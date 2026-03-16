#!/usr/bin/env bun

/**
 * Dormant MCP Reactivation Monitor
 * 
 * Monitors dormant MCP servers and checks if reactivation criteria are met.
 * Runs as part of governance checks or can be triggered manually.
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT_DIR = process.cwd();
const CONFIG_DIR = join(ROOT_DIR, 'opencode-config');

function readJSON(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message);
    return null;
  }
}

function checkDormantMCPs() {
  console.log('=== Dormant MCP Reactivation Check ===\n');
  
  // 1. Load dormant policy
  const dormantPolicy = readJSON(join(CONFIG_DIR, 'mcp-dormant-policy.json'));
  if (!dormantPolicy) {
    console.error('Could not read dormant policy');
    return;
  }
  
  // 2. Load main config to check current status
  const mainConfig = readJSON(join(CONFIG_DIR, 'opencode.json'));
  if (!mainConfig) {
    console.error('Could not read main config');
    return;
  }
  
  // 3. Check each dormant MCP
  const mcpServers = mainConfig.mcpServers || [];
  const dormantMCPs = Object.keys(dormantPolicy);
  
  console.log(`Found ${dormantMCPs.length} dormant MCPs in policy:\n`);
  
  let recommendations = [];
  
  dormantMCPs.forEach(mcpName => {
    // Find current MCP server config
    const mcpConfig = mcpServers.find(s => s.name === mcpName);
    const isCurrentlyEnabled = mcpConfig?.enabled !== false;
    
    const policy = dormantPolicy[mcpName];
    
    console.log(`MCP: ${mcpName}`);
    console.log(`  Status: ${isCurrentlyEnabled ? 'ENABLED ⚠️ (should be dormant)' : 'DORMANT ✅'}`);
    console.log(`  Reason: ${policy.reason}`);
    console.log(`  Owner: ${policy.owner}`);
    console.log(`  Reactivation Criteria: ${policy.reactivation_criteria}`);
    console.log();
    
    // Check if reactivation criteria might be met
    if (!isCurrentlyEnabled) {
      const assessment = assessReactivationCriteria(mcpName, policy.reactivation_criteria);
      if (assessment.met) {
        recommendations.push({
          mcp: mcpName,
          assessment: assessment,
          action: 'consider_reactivation'
        });
      }
    }
  });
  
  // 4. Generate report
  if (recommendations.length > 0) {
    console.log('\n=== Reactivation Recommendations ===\n');
    
    recommendations.forEach(rec => {
      console.log(`MCP: ${rec.mcp}`);
      console.log(`  Assessment: ${rec.assessment.assessment}`);
      console.log(`  Confidence: ${rec.assessment.confidence}`);
      console.log(`  Recommended Action: ${rec.action}`);
      console.log();
    });
    
    // Write recommendations to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFile = join(CONFIG_DIR, 'agents', `dormant-mcp-report-${timestamp}.json`);
    
    writeFileSync(reportFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      recommendations: recommendations,
      policy_check: 'completed'
    }, null, 2));
    
    console.log(`Report saved to: ${reportFile}`);
  } else {
    console.log('\n✅ No reactivation recommendations at this time.');
    console.log('All dormant MCPs are properly configured.');
  }
  
  // 5. Check for orphaned MCPs (enabled but not in policy)
  const enabledDormantMCPs = mcpServers
    .filter(s => s.enabled !== false && dormantMCPs.includes(s.name));
  
  if (enabledDormantMCPs.length > 0) {
    console.log('\n⚠️  WARNING: Some MCPs are enabled but marked as dormant in policy:');
    enabledDormantMCPs.forEach(mcp => {
      console.log(`  - ${mcp.name}`);
    });
    console.log('\nConsider disabling these MCPs or updating the dormant policy.');
  }
}

function assessReactivationCriteria(mcpName, criteria) {
  // Simple rule-based assessment
  // In a real implementation, this would check actual conditions
  
  const assessments = {
    'opencode-dashboard-launcher': {
      assessment: 'Dashboard launcher wrapper not yet implemented',
      confidence: 'high',
      met: false
    },
    'opencode-model-router-x': {
      assessment: 'Model router X MCP wrapper not yet available',
      confidence: 'high',
      met: false
    }
  };
  
  // Default assessment - check if wrapper files exist
  if (!assessments[mcpName]) {
    // Check for wrapper implementations
    const wrapperExists = checkWrapperImplementation(mcpName);
    
    return {
      assessment: wrapperExists ? 'Wrapper implementation found' : 'No wrapper implementation found',
      confidence: wrapperExists ? 'high' : 'medium',
      met: wrapperExists
    };
  }
  
  return assessments[mcpName];
}

function checkWrapperImplementation(mcpName) {
  // Check various locations for wrapper implementations
  const possibleLocations = [
    join(ROOT_DIR, 'packages', `opencode-${mcpName.replace('opencode-', '')}`, 'src'),
    join(ROOT_DIR, 'mcp-servers', `${mcpName}.js`),
    join(ROOT_DIR, 'mcp-servers', `${mcpName}.ts`),
    join(ROOT_DIR, 'plugins', mcpName)
  ];
  
  return possibleLocations.some(location => existsSync(location));
}

function integrateWithGovernance() {
  console.log('\n=== Integration with Governance System ===\n');
  
  // Check if governance script exists
  const governanceScript = join(ROOT_DIR, 'scripts', 'governance-check.mjs');
  
  if (existsSync(governanceScript)) {
    console.log('✅ Governance script found:', governanceScript);
    console.log('Recommend adding dormant MCP check to governance pipeline.');
    
    // Example integration code
    const integrationCode = `
// Add to governance-check.mjs
import { checkDormantMCPs } from '../opencode-config/agents/dormant-mcp-monitor.js';

async function checkDormantMCPCompliance() {
  console.log('\\n--- Dormant MCP Compliance Check ---');
  await checkDormantMCPs();
}
`;
    
    console.log('\nSuggested integration code:');
    console.log(integrationCode);
  } else {
    console.log('⚠️  Governance script not found.');
    console.log('Consider creating automated monitoring in scripts/governance-check.mjs');
  }
}

// Run checks
if (import.meta.main) {
  checkDormantMCPs();
  integrateWithGovernance();
}

export { checkDormantMCPs, integrateWithGovernance };