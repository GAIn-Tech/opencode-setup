#!/usr/bin/env node
/**
 * runtime-skill-tracker.mjs — PreToolUse hook for live Skill-RL usage tracking
 *
 * Fires BEFORE the `task` tool executes. Reads load_skills from tool_input and
 * calls SkillBank.recordUsage() for each skill to increment usage_count in real-time.
 *
 * Registered in ~/.claude/settings.json as a PreToolUse hook.
 * CRITICAL: Must ALWAYS exit 0 — a non-zero exit would ABORT the tool call.
 *
 * Hook input (stdin): JSON { session_id, tool_name, tool_input }
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

async function main() {
  // Read stdin
  let raw = '';
  for await (const chunk of process.stdin) {
    raw += chunk;
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch (_) {
    process.exit(0); // Unparseable input — never block
  }

  // Only act on 'task' tool (delegations)
  // Tool name may be PascalCase ('Task') or snake_case ('task') depending on hook version
  const toolName = (input.tool_name || '').toLowerCase();
  if (toolName !== 'task') {
    process.exit(0);
  }

  const toolInput = input.tool_input || {};
  const loadSkills = Array.isArray(toolInput.load_skills) ? toolInput.load_skills : [];
  const category = toolInput.category || 'unspecified';
  const description = toolInput.description || '';

  if (loadSkills.length === 0) {
    process.exit(0); // Nothing to record
  }

  // Derive task_type from description keywords (same logic as telemetry hook)
  const descLower = description.toLowerCase();
  let taskType = 'general';
  if (descLower.includes('debug') || descLower.includes('fix') || descLower.includes('error')) {
    taskType = 'debug';
  } else if (descLower.includes('refactor') || descLower.includes('cleanup') || descLower.includes('rename')) {
    taskType = 'refactor';
  } else if (descLower.includes('feature') || descLower.includes('add') || descLower.includes('implement') || descLower.includes('build')) {
    taskType = 'feature';
  } else if (descLower.includes('test') || descLower.includes('spec')) {
    taskType = 'test';
  } else if (descLower.includes('git') || descLower.includes('commit') || descLower.includes('branch')) {
    taskType = 'git';
  } else if (descLower.includes('ui') || descLower.includes('frontend') || descLower.includes('visual')) {
    taskType = 'ui';
  } else if (descLower.includes('research') || descLower.includes('find') || descLower.includes('search')) {
    taskType = 'research';
  }

  // Load SkillRLManager
  const skillRLPath = join(__dirname, '..', 'packages', 'opencode-skill-rl-manager', 'src', 'index.js');
  let skillRL;
  try {
    const { SkillRLManager } = require(skillRLPath);
    skillRL = new SkillRLManager({ autoLoad: true });
  } catch (_) {
    process.exit(0); // SkillRL unavailable — never block
  }

  // Record usage for each skill
  let recorded = 0;
  for (const skill of loadSkills) {
    try {
      if (skillRL.skillBank && typeof skillRL.skillBank.recordUsage === 'function') {
        skillRL.skillBank.recordUsage(skill, taskType);
        recorded++;
      }
    } catch (_) { /* non-fatal */ }
  }

  // Persist if anything changed
  if (recorded > 0) {
    try {
      if (typeof skillRL._save === 'function') {
        await skillRL._save();
      }
    } catch (_) { /* non-fatal — data will be saved on next ingest */ }
  }

  process.exit(0); // Always allow the tool to proceed
}

main().catch(() => process.exit(0)); // Never block on error
