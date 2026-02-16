import { NextResponse } from 'next/server';
import path from 'path';
import os from 'os';
import fs from 'fs';

export const dynamic = 'force-dynamic';

type SkillSummary = {
  name: string;
  success_rate: number;
  usage_count: number;
  last_updated: string;
};

type FailureHistoryItem = {
  task_id: string;
  task_type: string;
  timestamp: string;
  anti_pattern: string;
};

type RecentAdaptation = {
  skill: string;
  type: 'success' | 'failure';
  adaptation: string;
  timestamp: string;
};

type RLContract = {
  version: string;
  skill_bank: {
    general_count: number;
    task_specific_count: number;
    total: number;
    top_skills: SkillSummary[];
  };
  evolution: {
    failure_count: number;
    success_count: number;
    total_adaptations: number;
    recent_adaptations: RecentAdaptation[];
    failure_history: FailureHistoryItem[];
  };
  policy: {
    learning_rate: number;
    top_n_promotion_threshold: number;
    tier_adjustment_window: number;
  };
  fallback: boolean;
  data_fidelity?: 'live' | 'degraded' | 'unavailable';
  status_reason?: string;
  warning?: string;
  error?: string;
};

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

function getNumberAtPath(source: any, keyPath: string, fallback = 0): number {
  const value = keyPath.split('.').reduce((acc, key) => (acc && key in acc ? acc[key] : undefined), source);
  return toNumber(value, fallback);
}

function normalizeSkillTuple(entry: any, taskType?: string): SkillSummary | null {
  if (!Array.isArray(entry) || entry.length < 2) {
    return null;
  }

  const skillName = String(entry[0] || '').trim();
  const skillData = entry[1] || {};
  if (!skillName) {
    return null;
  }

  return {
    name: skillData.name || skillName,
    success_rate: toNumber(skillData.success_rate, toNumber(entry[1]?.successRate, 0)),
    usage_count: toNumber(skillData.usage_count, 0),
    last_updated: toIso(skillData.last_updated),
    ...(taskType ? { task_type: taskType } : {})
  } as SkillSummary;
}

function normalizeSkillObject(entry: any): SkillSummary | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const name = String(entry.name || '').trim();
  if (!name) {
    return null;
  }

  return {
    name,
    success_rate: toNumber(entry.success_rate ?? entry.successRate, 0),
    usage_count: toNumber(entry.usage_count ?? entry.usageCount, 0),
    last_updated: toIso(entry.last_updated ?? entry.lastUpdated)
  };
}

function decodeSkillBank(skillBank: any): { general: SkillSummary[]; taskSpecific: SkillSummary[] } {
  const generalRaw = Array.isArray(skillBank?.general) ? skillBank.general : [];
  const taskSpecificRaw = Array.isArray(skillBank?.taskSpecific) ? skillBank.taskSpecific : [];

  const general: SkillSummary[] = generalRaw
    .map((entry: any) => (Array.isArray(entry) ? normalizeSkillTuple(entry) : normalizeSkillObject(entry)))
    .filter((entry: SkillSummary | null): entry is SkillSummary => entry !== null);

  const taskSpecific: SkillSummary[] = [];
  taskSpecificRaw.forEach((taskEntry: any) => {
    if (Array.isArray(taskEntry) && taskEntry.length === 2 && Array.isArray(taskEntry[1])) {
      const taskType = String(taskEntry[0] || '').trim();
      taskEntry[1].forEach((skillTuple: any) => {
        const normalized = normalizeSkillTuple(skillTuple, taskType || undefined);
        if (normalized) {
          taskSpecific.push(normalized);
        }
      });
      return;
    }

    const normalized = normalizeSkillObject(taskEntry);
    if (normalized) {
      taskSpecific.push(normalized);
    }
  });

  return { general, taskSpecific };
}

function readPolicy(): RLContract['policy'] {
  const defaults = {
    learning_rate: 0.2,
    top_n_promotion_threshold: 5,
    tier_adjustment_window: 50
  };

  const policyPath = path.resolve(process.cwd(), '../../opencode-config/learning-update-policy.json');
  if (!fs.existsSync(policyPath)) {
    return defaults;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(policyPath, 'utf-8'));
    return {
      learning_rate: getNumberAtPath(raw, 'learning_rate', defaults.learning_rate),
      top_n_promotion_threshold: getNumberAtPath(
        raw,
        'top_n_promotion_threshold',
        getNumberAtPath(raw, 'policy.top_n_promotion_threshold', defaults.top_n_promotion_threshold)
      ),
      tier_adjustment_window: getNumberAtPath(
        raw,
        'tier_adjustment_window',
        getNumberAtPath(raw, 'policy.tier_adjustment_window', defaults.tier_adjustment_window)
      )
    };
  } catch {
    return defaults;
  }
}

function buildUnavailableResponse(
  message: string,
  error?: unknown,
  statusReason = 'unavailable'
): RLContract & { data_fidelity: string; status_reason: string } {
  return {
    version: '1.0.0',
    skill_bank: {
      general_count: 0,
      task_specific_count: 0,
      total: 0,
      top_skills: []
    },
    evolution: {
      failure_count: 0,
      success_count: 0,
      total_adaptations: 0,
      recent_adaptations: [],
      failure_history: []
    },
    policy: readPolicy(),
    fallback: true,
    data_fidelity: 'unavailable',
    status_reason: statusReason,
    warning: message,
    ...(error ? { error: String(error) } : {})
  };
}

export async function GET() {
  const skillRLPath = path.join(os.homedir(), '.opencode', 'skill-rl.json');

  try {
    if (!fs.existsSync(skillRLPath)) {
      return NextResponse.json(
        buildUnavailableResponse('RL state unavailable: ~/.opencode/skill-rl.json not found'),
        { status: 503 }
      );
    }

    let rlData: any;
    try {
      rlData = JSON.parse(fs.readFileSync(skillRLPath, 'utf-8'));
    } catch (parseError) {
      return NextResponse.json(
        buildUnavailableResponse('RL state unavailable: could not parse skill-rl.json', parseError),
        { status: 503 }
      );
    }

    const decoded = decodeSkillBank(rlData.skillBank);
    const topSkills = [...decoded.general, ...decoded.taskSpecific]
      .sort((a, b) => b.success_rate - a.success_rate)
      .slice(0, 10);

    const evolutionRaw = rlData.evolutionEngine || {};
    const failureHistoryRaw = Array.isArray(evolutionRaw.failure_history)
      ? evolutionRaw.failure_history
      : Array.isArray(evolutionRaw.failureHistory)
        ? evolutionRaw.failureHistory
        : [];

    const failureHistory: FailureHistoryItem[] = failureHistoryRaw.map((entry: any) => ({
      task_id: String(entry?.task_id || ''),
      task_type: String(entry?.task_type || 'unknown'),
      timestamp: toIso(entry?.timestamp),
      anti_pattern: String(entry?.anti_pattern?.type || entry?.anti_pattern || 'unknown')
    }));

    const reportedAdaptations = Array.isArray(evolutionRaw.recent_adaptations)
      ? evolutionRaw.recent_adaptations
      : Array.isArray(evolutionRaw.recentAdaptations)
        ? evolutionRaw.recentAdaptations
        : [];

    const recentAdaptations: RecentAdaptation[] =
      reportedAdaptations.length > 0
        ? reportedAdaptations.map((entry: any) => ({
            skill: String(entry?.skill || entry?.name || 'unknown'),
            type: entry?.type === 'success' ? 'success' : 'failure',
            adaptation: String(entry?.adaptation || entry?.reason || 'adaptation recorded'),
            timestamp: toIso(entry?.timestamp)
          }))
        : failureHistoryRaw.slice(-10).map((entry: any) => ({
            skill: String(
              Array.isArray(entry?.skills_used) && entry.skills_used.length > 0
                ? entry.skills_used[0]
                : entry?.anti_pattern?.skill || 'unknown'
            ),
            type: 'failure',
            adaptation: String(entry?.anti_pattern?.type || 'failure adaptation'),
            timestamp: toIso(entry?.timestamp)
          }));

    const failureCount = toNumber(
      evolutionRaw.failure_count ?? evolutionRaw.failureCount ?? evolutionRaw.total_failures,
      failureHistory.length
    );
    const successCount = toNumber(
      evolutionRaw.success_count ?? evolutionRaw.successCount ?? evolutionRaw.total_successes,
      0
    );

    return NextResponse.json({
      version: '1.0.0',
      skill_bank: {
        general_count: decoded.general.length,
        task_specific_count: decoded.taskSpecific.length,
        total: decoded.general.length + decoded.taskSpecific.length,
        top_skills: topSkills
      },
      evolution: {
        failure_count: failureCount,
        success_count: successCount,
        total_adaptations: failureCount + successCount,
        recent_adaptations: recentAdaptations,
        failure_history: failureHistory
      },
      policy: readPolicy(),
      fallback: false,
      data_fidelity: 'live',
      status_reason: 'ok'
    } satisfies RLContract);
  } catch (error) {
    return NextResponse.json(
      buildUnavailableResponse('RL state unavailable: unexpected error', error, 'unexpected_error'),
      { status: 503 }
    );
  }
}
