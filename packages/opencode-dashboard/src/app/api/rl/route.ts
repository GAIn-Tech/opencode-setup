import { NextResponse } from 'next/server';
import path from 'path';
import fsPromises from 'fs/promises';
import { ensureSkillRLState, getSkillRLFidelity } from '../_lib/skill-rl-state';

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
  data_fidelity?: 'seeded' | 'live' | 'degraded' | 'unavailable';
  status_reason?: string;
  warning?: string;
  error?: string;
  metadata?: {
    seeded_at: string | null;
    seed_source: string | null;
  };
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

function getNumberAtPath(source: Record<string, unknown>, keyPath: string, fallback = 0): number {
  const value = keyPath.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) return (acc as Record<string, unknown>)[key];
    return undefined;
  }, source);
  return toNumber(value, fallback);
}

function normalizeSkillTuple(entry: unknown, taskType?: string): SkillSummary | null {
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

function normalizeSkillObject(entry: unknown): SkillSummary | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const entryObj = entry as Record<string, unknown>;
  const name = String(entryObj.name || '').trim();
  if (!name) {
    return null;
  }

  return {
    name,
    success_rate: toNumber(entryObj.success_rate ?? entryObj.successRate, 0),
    usage_count: toNumber(entryObj.usage_count ?? entryObj.usageCount, 0),
    last_updated: toIso(entryObj.last_updated ?? entryObj.lastUpdated)
  };
}

function decodeSkillBank(skillBank: unknown): { general: SkillSummary[]; taskSpecific: SkillSummary[] } {
  const sb = (skillBank && typeof skillBank === 'object' ? skillBank : {}) as Record<string, unknown>;
  const generalRaw = Array.isArray(sb.general) ? sb.general : [];
  const taskSpecificRaw = Array.isArray(sb.taskSpecific) ? sb.taskSpecific : [];

  const general: SkillSummary[] = generalRaw
    .map((entry: unknown) => (Array.isArray(entry) ? normalizeSkillTuple(entry) : normalizeSkillObject(entry)))
    .filter((entry: SkillSummary | null): entry is SkillSummary => entry !== null);

  const taskSpecific: SkillSummary[] = [];
  taskSpecificRaw.forEach((taskEntry: unknown) => {
    if (Array.isArray(taskEntry) && taskEntry.length === 2 && Array.isArray(taskEntry[1])) {
      const taskType = String(taskEntry[0] || '').trim();
      taskEntry[1].forEach((skillTuple: unknown) => {
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

async function readPolicy(): Promise<RLContract['policy']> {
  const defaults = {
    learning_rate: 0.2,
    top_n_promotion_threshold: 5,
    tier_adjustment_window: 50
  };

  const policyPath = path.resolve(process.cwd(), '../../opencode-config/learning-update-policy.json');
  if (!await fsPromises.access(policyPath).then(() => true).catch(() => false)) {
    return defaults;
  }

  try {
    const raw = JSON.parse(await fsPromises.readFile(policyPath, 'utf-8'));
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

async function buildUnavailableResponse(
  message: string,
  error?: unknown,
  statusReason = 'unavailable'
): Promise<RLContract & { data_fidelity: string; status_reason: string }> {
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
    policy: await readPolicy(),
    fallback: true,
    data_fidelity: 'unavailable',
    status_reason: statusReason,
    warning: message,
    ...(error ? { error: String(error) } : {})
  };
}

export async function GET() {
  try {
    const rlData = await ensureSkillRLState();
    if (!rlData) {
      return NextResponse.json(
        await buildUnavailableResponse('RL state unavailable: could not initialize or parse skill-rl.json'),
        { status: 503 }
      );
    }

    const decoded = decodeSkillBank(rlData.skillBank);
    const topSkills = [...decoded.general, ...decoded.taskSpecific]
      .sort((a, b) => b.success_rate - a.success_rate)
      .slice(0, 10);

    const evolutionRaw = (rlData.evolutionEngine || {}) as Record<string, unknown>;
    const failureHistoryRaw = Array.isArray(evolutionRaw.failure_history)
      ? evolutionRaw.failure_history
      : Array.isArray(evolutionRaw.failureHistory)
        ? evolutionRaw.failureHistory
        : [];

    const failureHistory: FailureHistoryItem[] = failureHistoryRaw.map((raw: unknown) => {
      const e = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      const ap = (e.anti_pattern && typeof e.anti_pattern === 'object' ? e.anti_pattern : null) as Record<string, unknown> | null;
      return {
        task_id: String(e.task_id || ''),
        task_type: String(e.task_type || 'unknown'),
        timestamp: toIso(e.timestamp),
        anti_pattern: String(ap?.type || e.anti_pattern || 'unknown')
      };
    });

    const reportedAdaptations = Array.isArray(evolutionRaw.recent_adaptations)
      ? evolutionRaw.recent_adaptations
      : Array.isArray(evolutionRaw.recentAdaptations)
        ? evolutionRaw.recentAdaptations
        : [];

    const recentAdaptations: RecentAdaptation[] =
      reportedAdaptations.length > 0
        ? reportedAdaptations.map((raw: unknown) => {
            const e = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
            return {
              skill: String(e.skill || e.name || 'unknown'),
              type: e.type === 'success' ? 'success' as const : 'failure' as const,
              adaptation: String(e.adaptation || e.reason || 'adaptation recorded'),
              timestamp: toIso(e.timestamp)
            };
          })
        : failureHistoryRaw.slice(-10).map((raw: unknown) => {
            const e = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
            const ap = (e.anti_pattern && typeof e.anti_pattern === 'object' ? e.anti_pattern : null) as Record<string, unknown> | null;
            const skillsUsed = Array.isArray(e.skills_used) ? e.skills_used : [];
            return {
              skill: String(
                skillsUsed.length > 0
                  ? skillsUsed[0]
                  : ap?.skill || 'unknown'
              ),
              type: 'failure' as const,
              adaptation: String(ap?.type || 'failure adaptation'),
              timestamp: toIso(e.timestamp)
            };
          });

    const failureCount = toNumber(
      evolutionRaw.failure_count ?? evolutionRaw.failureCount ?? evolutionRaw.total_failures,
      failureHistory.length
    );
    const successCount = toNumber(
      evolutionRaw.success_count ?? evolutionRaw.successCount ?? evolutionRaw.total_successes,
      0
    );

    const dataFidelity = getSkillRLFidelity(rlData);

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
      policy: await readPolicy(),
      fallback: false,
      data_fidelity: dataFidelity,
      status_reason: dataFidelity === 'seeded' ? 'seeded_state' : 'ok',
      metadata: {
        seeded_at: typeof rlData.seeded_at === 'string' ? rlData.seeded_at : null,
        seed_source: typeof rlData.seed_source === 'string' ? rlData.seed_source : null,
      }
    } satisfies RLContract);
  } catch (error) {
    return NextResponse.json(
      await buildUnavailableResponse('RL state unavailable: unexpected error', error, 'unexpected_error'),
      { status: 503 }
    );
  }
}
