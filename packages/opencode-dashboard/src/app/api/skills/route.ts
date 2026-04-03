import { NextResponse } from 'next/server';
import path from 'path';
import os from 'os';
import fs from 'fs';
import fsPromises from 'fs/promises';

export const dynamic = 'force-dynamic';

interface SkillEntry {
  name: string;
  success_rate: number;
  usage_count: number;
  last_updated: string;
  task_type?: string;
}

const OPENCODE_DIRNAME = '.opencode';

function resolveDataHome(): string {
  if (process.env.OPENCODE_DATA_HOME) return process.env.OPENCODE_DATA_HOME;
  if (process.env.XDG_DATA_HOME) return path.join(process.env.XDG_DATA_HOME, 'opencode');
  const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(homeDir, OPENCODE_DIRNAME);
}

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

function normalizeSkillObject(entry: unknown, taskType?: string): SkillEntry | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const obj = entry as Record<string, unknown>;
  const name = String(obj.name || '').trim();
  if (!name) {
    return null;
  }

  return {
    ...(taskType ? { task_type: taskType } : {}),
    name,
    success_rate: toNumber(obj.success_rate ?? obj.successRate, 0),
    usage_count: toNumber(obj.usage_count ?? obj.usageCount, 0),
    last_updated: toIso(obj.last_updated ?? obj.lastUpdated)
  };
}

function normalizeSkillTuple(entry: unknown, taskType?: string): SkillEntry | null {
  if (!Array.isArray(entry) || entry.length < 2) {
    return null;
  }

  const tupleName = String(entry[0] || '').trim();
  const tupleData = entry[1] || {};
  const mapped = normalizeSkillObject({ name: tupleName, ...tupleData }, taskType);
  return mapped;
}

function decodeGeneralSkills(raw: unknown): SkillEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry: unknown) => (Array.isArray(entry) ? normalizeSkillTuple(entry) : normalizeSkillObject(entry)))
    .filter((v): v is SkillEntry => v !== null);
}

function decodeTaskSpecificSkills(raw: unknown): SkillEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const decoded: SkillEntry[] = [];
  raw.forEach((entry: unknown) => {
    if (Array.isArray(entry) && entry.length === 2 && Array.isArray(entry[1])) {
      const taskType = String(entry[0] || '').trim();
      entry[1].forEach((skillTuple: unknown) => {
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

function safeParseJson(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
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
  fallback: true,
  data_fidelity: 'demo',
  status_reason: 'missing_state',
  demo: true,
  _note: 'Demo data - run OpenCode to generate real skill evolution data'
};

export async function GET() {
  try {
    const opencodePath = resolveDataHome();
    const skillsPath = path.join(opencodePath, 'skill-rl.json');
    
    // Check if skills file exists
    if (!fs.existsSync(skillsPath)) {
      return NextResponse.json(demoData);
    }
    
    // Try to load real skill data
    try {
      const raw = await fsPromises.readFile(skillsPath, 'utf-8');
      const skillData = safeParseJson(raw);
      if (!skillData) {
        console.error('[Skills API] Parse error: invalid JSON');
        return NextResponse.json(
          {
            ...demoData,
            data_fidelity: 'degraded',
            status_reason: 'malformed_state',
            warning: 'Using fallback data - engine unavailable'
          },
          { status: 503 }
        );
      }
      const skillBank = (skillData.skillBank || {}) as Record<string, unknown>;
      const generalSkills = decodeGeneralSkills(skillBank.general);
      const taskSpecificSkills = decodeTaskSpecificSkills(skillBank.taskSpecific);
      const evolutionEngine = (skillData.evolutionEngine || {}) as Record<string, unknown>;
      const failureHistory = Array.isArray(evolutionEngine.failure_history)
        ? evolutionEngine.failure_history
        : Array.isArray(evolutionEngine.failureHistory)
          ? evolutionEngine.failureHistory
          : [];
      
      return NextResponse.json({
        version: '1.0.0',
        skills: {
          general_count: generalSkills.length,
          task_specific_count: taskSpecificSkills.length,
          total: generalSkills.length + taskSpecificSkills.length,
          top_general: [...generalSkills]
            .sort((a, b) => b.success_rate - a.success_rate)
            .slice(0, 5),
          top_task_specific: [...taskSpecificSkills]
            .sort((a, b) => b.success_rate - a.success_rate)
            .slice(0, 5)
        },
        learning: {
          total_failures_learned: failureHistory.length,
          total_successes_learned: toNumber(evolutionEngine.success_count ?? evolutionEngine.successCount, 0),
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
        fallback: false,
        data_fidelity: 'live',
        status_reason: 'ok',
        demo: false
      });
    } catch (parseError) {
      console.error('[Skills API] Parse error:', parseError);
      return NextResponse.json(
        {
          ...demoData,
          data_fidelity: 'degraded',
          status_reason: 'malformed_state',
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
      fallback: true,
      data_fidelity: 'degraded',
      status_reason: 'unexpected_error',
      demo: false,
      error: String(error)
    }, { status: 503 });
  }
}
