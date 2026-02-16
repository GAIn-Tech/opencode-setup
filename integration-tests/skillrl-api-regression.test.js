import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { GET as getRL } from '../packages/opencode-dashboard/src/app/api/rl/route';
import { GET as getSkills } from '../packages/opencode-dashboard/src/app/api/skills/route';

const opencodeDir = path.join(os.homedir(), '.opencode');
const skillPath = path.join(opencodeDir, 'skill-rl.json');

let backup = null;
let hadOriginal = false;

function ensureDir() {
  if (!fs.existsSync(opencodeDir)) fs.mkdirSync(opencodeDir, { recursive: true });
}

function writeSkill(content) {
  ensureDir();
  fs.writeFileSync(skillPath, JSON.stringify(content, null, 2));
}

function removeSkill() {
  if (fs.existsSync(skillPath)) fs.unlinkSync(skillPath);
}

function validState() {
  return {
    skillBank: {
      general: [
        ['systematic-debugging', { name: 'systematic-debugging', success_rate: 0.9, usage_count: 10, last_updated: Date.now() }],
        ['test-driven-development', { name: 'test-driven-development', success_rate: 0.8, usage_count: 8, last_updated: Date.now() }],
      ],
      taskSpecific: [
        ['debugging', [['systematic-debugging', { name: 'systematic-debugging', success_rate: 0.92, usage_count: 6, last_updated: Date.now() }]]],
      ],
    },
    evolutionEngine: {
      failure_count: 2,
      success_count: 5,
      failure_history: [
        {
          task_id: 't1',
          task_type: 'debugging',
          timestamp: Date.now(),
          anti_pattern: { type: 'shotgun-debugging' },
          skills_used: ['systematic-debugging'],
        },
      ],
      recent_adaptations: [
        {
          skill: 'systematic-debugging',
          type: 'success',
          adaptation: 'promoted after success',
          timestamp: Date.now(),
        },
      ],
    },
  };
}

if (fs.existsSync(skillPath)) {
  backup = fs.readFileSync(skillPath, 'utf8');
  hadOriginal = true;
}

afterEach(() => {
  if (hadOriginal && backup !== null) {
    ensureDir();
    fs.writeFileSync(skillPath, backup);
  } else {
    removeSkill();
  }
});

describe('SkillRL API regression', () => {
  test('/api/rl returns 503 fallback when file is missing', async () => {
    removeSkill();
    const res = await getRL();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.fallback).toBe(true);
    expect(body.skill_bank.total).toBe(0);
    expect(body.evolution.total_adaptations).toBe(0);
    expect(typeof body.warning).toBe('string');
  });

  test('/api/rl returns structured contract for valid state', async () => {
    writeSkill(validState());
    const res = await getRL();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.fallback).toBe(false);
    expect(body.version).toBe('1.0.0');
    expect(body.skill_bank.general_count).toBeGreaterThan(0);
    expect(body.skill_bank.task_specific_count).toBeGreaterThan(0);
    expect(Array.isArray(body.skill_bank.top_skills)).toBe(true);
    expect(body.evolution.failure_count).toBe(2);
    expect(body.evolution.success_count).toBe(5);
    expect(Array.isArray(body.evolution.failure_history)).toBe(true);
    expect(Array.isArray(body.evolution.recent_adaptations)).toBe(true);
    expect(typeof body.policy.learning_rate).toBe('number');
  });

  test('/api/skills returns demo data when file is missing', async () => {
    removeSkill();
    const res = await getSkills();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.demo).toBe(true);
    expect(body.skills.total).toBeGreaterThan(0);
  });

  test('/api/skills returns parsed real data when file exists', async () => {
    writeSkill(validState());
    const res = await getSkills();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.fallback).toBe(false);
    expect(body.skills.general_count).toBeGreaterThan(0);
    expect(body.skills.task_specific_count).toBeGreaterThan(0);
    expect(Array.isArray(body.skills.top_general)).toBe(true);
    expect(Array.isArray(body.skills.top_task_specific)).toBe(true);
    expect(body.learning.total_failures_learned).toBeGreaterThanOrEqual(1);
  });

  test('/api/skills returns 503 fallback on malformed state', async () => {
    ensureDir();
    fs.writeFileSync(skillPath, '{invalid json');
    const res = await getSkills();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.warning).toContain('fallback');
    expect(body.demo).toBe(true);
  });
});
