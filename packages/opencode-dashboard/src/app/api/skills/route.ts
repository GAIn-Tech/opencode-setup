import { NextResponse } from 'next/server';
import path from 'path';
import os from 'os';
import fs from 'fs';

export const dynamic = 'force-dynamic';

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function toIso(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
  }
  return new Date(0).toISOString();
}

function normalizeSkillObject(entry: any, taskType?: string) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const name = String(entry.name || '').trim();
  if (!name) {
    return null;
  }

  return {
    ...(taskType ? { task_type: taskType } : {}),
    name,
    success_rate: toNumber(entry.success_rate ?? entry.successRate, 0),
    usage_count: toNumber(entry.usage_count ?? entry.usageCount, 0),
    last_updated: toIso(entry.last_updated ?? entry.lastUpdated)
  };
}

function normalizeSkillTuple(entry: any, taskType?: string) {
  if (!Array.isArray(entry) || entry.length < 2) {
    return null;
  }

  const tupleName = String(entry[0] || '').trim();
  const tupleData = entry[1] || {};
  const mapped = normalizeSkillObject({ name: tupleName, ...tupleData }, taskType);
  return mapped;
}

function decodeGeneralSkills(raw: any): any[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map(entry => (Array.isArray(entry) ? normalizeSkillTuple(entry) : normalizeSkillObject(entry)))
    .filter(Boolean);
}

function decodeTaskSpecificSkills(raw: any): any[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const decoded: any[] = [];
  raw.forEach(entry => {
    if (Array.isArray(entry) && entry.length === 2 && Array.isArray(entry[1])) {
      const taskType = String(entry[0] || '').trim();
      entry[1].forEach((skillTuple: any) => {
        const mapped = normalizeSkillTuple(skillTuple, taskType || undefined);
        if (mapped) {
          decoded.push(mapped);
        }
      });
      return;
    }

    const mapped = normalizeSkillObject(entry);
    if (mapped) {
      decoded.push(mapped);
    }
  });

  return decoded;
}

// Demo data when no real data exists
const demoData = {
  version: '1.0.0',
  skills: {
    general_count: 12,
    task_specific_count: 8,
    total: 20,
    top_general: [
      { name: 'systematic-debugging', success_rate: 0.85, usage_count: 45, last_updated: '2026-02-13T10:00:00Z' },
      { name: 'test-driven-development', success_rate: 0.78, usage_count: 32, last_updated: '2026-02-12T15:30:00Z' },
      { name: 'lsp-navigation', success_rate: 0.82, usage_count: 28, last_updated: '2026-02-11T09:15:00Z' },
      { name: 'git-master', success_rate: 0.91, usage_count: 67, last_updated: '2026-02-13T08:00:00Z' },
      { name: 'refactoring', success_rate: 0.75, usage_count: 23, last_updated: '2026-02-10T14:20:00Z' }
    ],
    top_task_specific: [
      { task_type: 'code_generation', name: 'frontend-design', success_rate: 0.88, usage_count: 15 },
      { task_type: 'debugging', name: 'systematic-debugging', success_rate: 0.85, usage_count: 45 },
      { task_type: 'refactoring', name: 'refactoring', success_rate: 0.75, usage_count: 23 },
      { task_type: 'research', name: 'explore', success_rate: 0.92, usage_count: 56 }
    ]
  },
  learning: {
    total_failures_learned: 24,
    total_successes_learned: 67,
    recent_evolutions: [],
    quota_signals: []
  },
  insights: [
    'systematic-debugging has 15% higher success rate than shotgun debugging',
    'Skills with >50 uses have 2x higher success rate',
    'Task-specific skills outperform general skills by 23% on average'
  ],
  demo: true,
  _note: 'Demo data - run OpenCode to generate real skill evolution data'
};

export async function GET() {
  try {
    const opencodePath = path.join(os.homedir(), '.opencode');
    const skillsPath = path.join(opencodePath, 'skill-rl.json');
    
    // Check if skills file exists
    if (!fs.existsSync(skillsPath)) {
      return NextResponse.json(demoData);
    }
    
    // Try to load real skill data
    try {
      const skillData = JSON.parse(fs.readFileSync(skillsPath, 'utf-8'));
      const generalSkills = decodeGeneralSkills(skillData.skillBank?.general);
      const taskSpecificSkills = decodeTaskSpecificSkills(skillData.skillBank?.taskSpecific);
      const failureHistory = Array.isArray(skillData.evolutionEngine?.failure_history)
        ? skillData.evolutionEngine.failure_history
        : Array.isArray(skillData.evolutionEngine?.failureHistory)
          ? skillData.evolutionEngine.failureHistory
          : [];
      
      return NextResponse.json({
        version: '1.0.0',
        skills: {
          general_count: generalSkills.length,
          task_specific_count: taskSpecificSkills.length,
          total: generalSkills.length + taskSpecificSkills.length,
          top_general: [...generalSkills]
            .sort((a: any, b: any) => (b.success_rate || 0) - (a.success_rate || 0))
            .slice(0, 5),
          top_task_specific: [...taskSpecificSkills]
            .sort((a: any, b: any) => (b.success_rate || 0) - (a.success_rate || 0))
            .slice(0, 5)
        },
        learning: {
          total_failures_learned: failureHistory.length,
          total_successes_learned: toNumber(skillData.evolutionEngine?.success_count ?? skillData.evolutionEngine?.successCount, 0),
          recent_evolutions: [],
          quota_signals: []
        },
        insights: [
          generalSkills.length
            ? `${generalSkills.length} general skills loaded`
            : 'No general skills yet',
          taskSpecificSkills.length
            ? `${taskSpecificSkills.length} task-specific skills loaded`
            : 'No task-specific skills yet'
        ],
        fallback: false
      });
    } catch (parseError) {
      console.error('[Skills API] Parse error:', parseError);
      return NextResponse.json(
        {
          ...demoData,
          warning: 'Using fallback data - engine unavailable'
        },
        { status: 503 }
      );
    }
  } catch (error) {
    console.error('[Skills API] Error:', error);
    return NextResponse.json({
      version: '1.0.0',
      skills: { general_count: 0, task_specific_count: 0, total: 0, top_general: [], top_task_specific: [] },
      learning: { total_failures_learned: 0, total_successes_learned: 0, recent_evolutions: [], quota_signals: [] },
      insights: [],
      error: String(error)
    });
  }
}
