import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextResponse } from 'next/server';
import { collectCorrelationData } from './lib/correlation.js';
import { normalizeEvents, persistEvents, summarizeEventProvenance } from './lib/event-store.js';
import { evaluatePolicyEngine } from './lib/policy-engine.js';

export const dynamic = 'force-dynamic';

type CachedOrchestrationPayload = {
  expiresAt: number;
  payload: Record<string, unknown>;
};

const ORCHESTRATION_CACHE_TTL_MS = 15_000;
const orchestrationCache = new Map<string, CachedOrchestrationPayload>();
const orchestrationInFlight = new Map<string, Promise<Record<string, unknown>>>();

type Dist = { name: string; count: number; share: number; tokens?: number; success_rate?: number };
type Signal = { key: string; label: string; value: number; target: number; level: 'healthy' | 'warning' | 'critical'; detail: string };
type GapSeverity = 'critical' | 'high' | 'medium';
type IntegrationGap = {
  id: string;
  severity: GapSeverity;
  domain: 'governance' | 'plugins' | 'fallback' | 'telemetry' | 'learning-loop' | 'ci';
  title: string;
  detail: string;
  evidence: string;
  recommended_next_step: string;
};
type EventRecord = {
  timestamp?: string;
  trace_id?: string;
  span_id?: string;
  parent_span_id?: string;
  model?: string;
  skill?: string;
  tool?: string;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  iteration_index?: number;
  termination_reason?: string;
  provenance?: {
    source?: string;
    event_hash?: string;
    signature?: string;
    signature_valid?: boolean;
    signing_algorithm?: string;
    received_at?: string;
    signer?: string;
  };
};

type SigningMode = 'off' | 'allow-unsigned' | 'require-signed' | 'require-valid-signature';

function resolveSigningMode(): SigningMode {
  const defaultMode = process.env.NODE_ENV === 'production' ? 'require-valid-signature' : 'allow-unsigned';
  const raw = String(process.env.OPENCODE_EVENT_SIGNING_MODE || defaultMode).trim().toLowerCase();
  if (raw === 'off') return 'off';
  if (raw === 'allow-unsigned') return 'allow-unsigned';
  if (raw === 'require-signed') return 'require-signed';
  if (raw === 'require-valid-signature') return 'require-valid-signature';
  return defaultMode;
}

function n(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const parsed = Number(v);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function arr<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function pct(count: number, total: number): number {
  if (total <= 0) return 0;
  return Number(((count / total) * 100).toFixed(2));
}

function pctl(values: number[], q: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(s.length - 1, Math.floor((q / 100) * (s.length - 1))));
  return s[idx] ?? 0;
}

function parseIntParam(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseFloatParam(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseFloat(value || '');
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function top(map: Map<string, number>, topN: number, tokenMap?: Map<string, number>): Dist[] {
  const total = [...map.values()].reduce((a, b) => a + b, 0);
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([name, count]) => ({ name, count, share: pct(count, total), ...(tokenMap ? { tokens: tokenMap.get(name) ?? 0 } : {}) }));
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

function scoreLevel(value: number, target: number): 'healthy' | 'warning' | 'critical' {
  if (value >= target) return 'healthy';
  if (value >= target * 0.8) return 'warning';
  return 'critical';
}

function countSkillUniverse(): number {
  const roots = [
    path.resolve(process.cwd(), '../../opencode-config/skills'),
    path.join(os.homedir(), '.config', 'opencode', 'skills'),
    path.join(os.homedir(), '.opencode', 'skills'),
  ];
  const seen = new Set<string>();
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const stack = [root];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        continue;
      }
      if (entries.some((e) => e.isFile() && e.name.toLowerCase() === 'skill.md')) {
        seen.add(path.basename(current));
      }
      for (const entry of entries) {
        if (entry.isDirectory()) stack.push(path.join(current, entry.name));
      }
    }
  }
  return seen.size;
}

function fileContains(filePath: string, token: string): boolean {
  try {
    if (!fs.existsSync(filePath)) return false;
    return fs.readFileSync(filePath, 'utf-8').includes(token);
  } catch {
    return false;
  }
}

function countPluginDirectories(repoRoot: string): number {
  const pluginsPath = path.join(repoRoot, 'plugins');
  if (!fs.existsSync(pluginsPath)) return 0;
  try {
    return fs
      .readdirSync(pluginsPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .length;
  } catch {
    return 0;
  }
}

function parseFallbackFirstProvider(filePath: string): string {
  const json = readJson<Record<string, unknown>>(filePath, {});
  if (!json || typeof json !== 'object') return '';
  const fallbackModels = arr<Record<string, unknown>>(json.fallbackModels as unknown[] ?? json.fallback_models as unknown[] ?? []);
  if (fallbackModels.length > 0) {
    const first = fallbackModels[0];
    const provider = String(first?.provider || '').trim();
    if (provider) return provider.toLowerCase();
    const model = String(first?.model || '').trim();
    if (model.includes('/')) return model.split('/')[0]!.toLowerCase();
  }
  const priority = arr<unknown>(json.provider_priority as unknown[] ?? json.providerPriority as unknown[] ?? []);
  if (priority.length > 0) return String(priority[0]).toLowerCase();
  return '';
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const noCache = params.get('noCache') === '1';
    const cacheKey = request.url;

    if (!noCache) {
      const cached = orchestrationCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return NextResponse.json(cached.payload);
      }
      const pending = orchestrationInFlight.get(cacheKey);
      if (pending) {
        return NextResponse.json(await pending);
      }
    }

    const computePayload = async (): Promise<Record<string, unknown>> => {
    const sinceDays = parseIntParam(params.get('sinceDays'), 30, 1, 365);
    const topN = parseIntParam(params.get('topN'), 10, 5, 30);
    const coverageTarget = parseFloatParam(params.get('coverageTarget'), 60, 10, 100);
    const loopWarningThreshold = parseIntParam(params.get('loopWarningThreshold'), 3, 1, 50);
    const successTarget = parseFloatParam(params.get('successTarget'), 85, 10, 100);
    const providerHealthTarget = parseFloatParam(params.get('providerHealthTarget'), 80, 10, 100);
    const cutoffMs = Date.now() - sinceDays * 24 * 60 * 60 * 1000;

    const op = path.join(os.homedir(), '.opencode');
    const repoRoot = path.resolve(process.cwd(), '..', '..');
    const messagesPath = path.join(op, 'messages');
    const skillRlPath = path.join(op, 'skill-rl.json');
    const learningPath = path.join(op, 'learning');
    const providerStatusPath = path.join(op, 'provider-status.json');
    const customEventsPath = path.join(op, 'orchestration-events.json');
    const configValidationDoc = path.join(repoRoot, 'opencode-config', 'docs', 'configuration-precedence.md');
    const pluginConfigPath = path.join(repoRoot, 'opencode-config', 'opencode.json');
    const pluginDependencyGraphPath = path.join(repoRoot, 'opencode-config', 'plugin-dependency-graph.json');
    const pluginConfigSchemaPath = path.join(repoRoot, 'opencode-config', 'plugin-config-schema.json');
    const pluginEventSchemaPath = path.join(repoRoot, 'opencode-config', 'plugin-event-schema.json');
    const configSchemaPath = path.join(repoRoot, 'opencode-config', 'opencode-config-schema.json');
    const pluginLifecyclePackage = path.join(repoRoot, 'packages', 'opencode-plugin-lifecycle');
    const pluginRuntimeStatePath = path.join(op, 'plugin-runtime-state.json');
    const strategyRuntimeStatePath = path.join(op, 'strategy-health.json');
    const retrievalQualityPath = path.join(op, 'retrieval-quality.json');
    const ciDriftWorkflowPath = path.join(repoRoot, '.github', 'workflows', 'config-drift-check.yml');
    const fallbackConfigProject = path.join(repoRoot, 'opencode-config', 'rate-limit-fallback.json');
    const fallbackConfigRoot = path.join(repoRoot, 'rate-limit-fallback.json');

    const {
      sessions,
      model,
      skill,
      tool,
      agent,
      termination,
      modelTokens,
      skillTokens,
      toolTokens,
      loopsBySession,
      perMessageTokens,
      totalMessages,
      delegatedMessages,
      traces,
      parentSpans,
      errorMentions,
      signedCustomEvents,
      validSignedCustomEvents,
      withTokens,
      inTok,
      outTok,
      totalTok,
      customEvents,
    } = await collectCorrelationData({
      messagesPath,
      customEventsPath,
      cutoffMs,
    });

    const universe = countSkillUniverse();
    const rl = readJson<any>(skillRlPath, {});
    const rlGeneral = arr<any>(rl?.skillBank?.general).length;
    const rlTask = arr<any>(rl?.skillBank?.taskSpecific).length;
    const rlSkills = [...arr<any>(rl?.skillBank?.general), ...arr<any>(rl?.skillBank?.taskSpecific)];
    const rlSuccessAvg =
      rlSkills.length > 0
        ? rlSkills.reduce((sum, entry) => sum + n(entry?.success_rate ?? entry?.[1]?.success_rate ?? entry?.successRate, 0), 0) / rlSkills.length
        : 0;

    const anti = readJson<any>(path.join(learningPath, 'anti-patterns.json'), []);
    const pos = readJson<any>(path.join(learningPath, 'positive-patterns.json'), []);
    const antiItems = Array.isArray(anti) ? anti : arr<any>(anti?.patterns || anti?.items);
    const posItems = Array.isArray(pos) ? pos : arr<any>(pos?.patterns || pos?.items);
    const antiTotal = antiItems.reduce((sum, item) => sum + n(item?.count, 0), 0);
    const posTotal = posItems.reduce((sum, item) => sum + n(item?.count, 0), 0);

    const provider = readJson<any>(providerStatusPath, {});
    const summary = provider?.snapshot?.summary || provider?.summary || {};
    const providerTotal = n(summary.healthy_count) + n(summary.warning_count) + n(summary.critical_count) + n(summary.unknown_count);
    const providerHealthy = providerTotal > 0 ? (n(summary.healthy_count) / providerTotal) * 100 : 0;

    const runStats = {
      total: sessions.size,
      active: 0,
      completed: sessions.size,
      failed: 0,
    };

    const totalLoops = [...loopsBySession.values()].reduce((sum, c) => sum + c, 0);
    const sessionsWithLoops = [...loopsBySession.values()].filter((c) => c > 0).length;
    const maxLoop = [...loopsBySession.values()].reduce((m, c) => Math.max(m, c), 0);

    const successRate = totalMessages > 0 ? ((totalMessages - errorMentions) / totalMessages) * 100 : 0;
    const coverage = universe > 0 ? (skill.size / universe) * 100 : 0;
    const loopStability = sessions.size > 0 ? Math.max(0, 100 - (totalLoops / sessions.size) * (100 / loopWarningThreshold)) : 100;
    const observedRecords = totalMessages + customEvents.length;
    const telemetry = observedRecords > 0 ? ((withTokens + traces) / (2 * observedRecords)) * 100 : 0;

    const signals: Signal[] = [
      { key: 'success_rate', label: 'Success Rate', value: Number(successRate.toFixed(2)), target: successTarget, level: scoreLevel(successRate, successTarget), detail: `${Math.max(totalMessages - errorMentions, 0)} / ${totalMessages} records clean` },
      { key: 'skill_coverage', label: 'Skill Coverage', value: Number(coverage.toFixed(2)), target: coverageTarget, level: scoreLevel(coverage, coverageTarget), detail: `${skill.size} skills observed of ${universe}` },
      { key: 'loop_stability', label: 'Loop Stability', value: Number(loopStability.toFixed(2)), target: 80, level: scoreLevel(loopStability, 80), detail: `${totalLoops} loop signals across ${sessionsWithLoops} sessions` },
      { key: 'provider_health', label: 'Provider Health', value: Number(providerHealthy.toFixed(2)), target: providerHealthTarget, level: scoreLevel(providerHealthy, providerHealthTarget), detail: `${n(summary.healthy_count)} healthy providers of ${providerTotal}` },
      { key: 'telemetry_completeness', label: 'Telemetry Completeness', value: Number(telemetry.toFixed(2)), target: 70, level: scoreLevel(telemetry, 70), detail: `${withTokens} records with tokens, ${traces} with trace IDs` },
    ];

    const score = Math.round(
      signals[0].value * 0.35 + signals[1].value * 0.2 + signals[2].value * 0.2 + signals[3].value * 0.15 + signals[4].value * 0.1
    );

    const pluginsConfigured = arr<any>(readJson<any>(pluginConfigPath, {})?.plugins).length;
    const pluginsDiscovered = countPluginDirectories(repoRoot);
    const hasConfigValidationTodo = fileContains(configValidationDoc, 'Add config validation on load (schema check)');
    const hasPluginLifecycle = fs.existsSync(pluginLifecyclePackage);
    const hasPluginDependencyGraph = fs.existsSync(pluginDependencyGraphPath);
    const hasPluginConfigSchema = fs.existsSync(pluginConfigSchemaPath);
    const hasPluginEventSchema = fs.existsSync(pluginEventSchemaPath);
    const hasConfigSchema = fs.existsSync(configSchemaPath);
    const hasCiDriftGate = fs.existsSync(ciDriftWorkflowPath);
    const pluginRuntimeState = readJson<Record<string, any>>(pluginRuntimeStatePath, {});
    const pluginRuntimeEntries = Object.values(pluginRuntimeState || {});
    const pluginQuarantineActive = pluginRuntimeEntries.filter((entry) => Boolean(entry?.quarantine || entry?.quarantined)).length;
    const pluginCrashLike = pluginRuntimeEntries.filter((entry) => {
      const status = String(entry?.status || '').toLowerCase();
      return status === 'crashed' || status === 'failed';
    }).length;
    const pluginDegradedTransitions = pluginRuntimeEntries.filter((entry) => {
      const transition = String(entry?.transition_reason || '').toLowerCase();
      return transition.includes('->degraded');
    }).length;
    const strategyRuntimeState = readJson<Record<string, unknown>>(strategyRuntimeStatePath, {});
    const strategyEntries = Object.values((strategyRuntimeState?.entries as Record<string, unknown>) || {});
    const strategyBypassActive = strategyEntries.filter((entry: unknown) => Number((entry as Record<string, unknown>)?.bypass_until || 0) > Date.now()).length;
    const strategyUnhealthy = strategyEntries.filter((entry: unknown) => Number((entry as Record<string, unknown>)?.consecutive_failures || 0) > 0).length;
    const retrievalQuality = readJson<Record<string, unknown> | null>(retrievalQualityPath, null);
    const retrievalMapAtK = Number(retrievalQuality?.map_at_k || 0);
    const retrievalGroundedRecall = Number(retrievalQuality?.grounded_recall || 0);
    const retrievalSampleSize = Number(retrievalQuality?.sample_size || 0);
    const firstProviderProject = parseFallbackFirstProvider(fallbackConfigProject);
    const firstProviderRoot = parseFallbackFirstProvider(fallbackConfigRoot);
    const fallbackOrderAligned = !firstProviderProject || !firstProviderRoot || firstProviderProject === firstProviderRoot;

    const {
      integrationGaps,
      governanceScore,
      pluginScore,
      observabilityScore,
      adaptationScore,
      closedLoopScore,
      frontierScore,
    } = evaluatePolicyEngine({
      hasConfigValidationTodo,
      hasPluginLifecycle,
      hasPluginDependencyGraph,
      hasPluginConfigSchema,
      hasPluginEventSchema,
      hasConfigSchema,
      hasCiDriftGate,
      fallbackOrderAligned,
      firstProviderProject,
      firstProviderRoot,
      pluginQuarantineActive,
      pluginCrashLike,
      strategyBypassActive,
      strategyUnhealthy,
      retrievalQuality,
      retrievalMapAtK,
      retrievalGroundedRecall,
      retrievalSampleSize,
      pluginsConfigured,
      pluginsDiscovered,
      score,
      signals,
      rlSuccessAvg,
      antiTotal,
      posTotal,
    });

    const hasMessages = fs.existsSync(messagesPath);
    const hasSkillRl = fs.existsSync(skillRlPath);
    const hasLearning = fs.existsSync(learningPath);
    const hasProviderStatus = fs.existsSync(providerStatusPath);
    const hasCustomEvents = fs.existsSync(customEventsPath);
    const signingEnabled = Boolean(process.env.OPENCODE_EVENT_SIGNING_KEY);
    const signingMode = resolveSigningMode();
    const replaySeedEnabled = Boolean(process.env.OPENCODE_REPLAY_SEED);
    const fidelityMode: 'live' | 'degraded' | 'demo' =
      observedRecords > 0 && hasMessages && hasSkillRl && hasProviderStatus
        ? 'live'
        : observedRecords > 0
          ? 'degraded'
          : 'demo';
    const fidelityReason =
      fidelityMode === 'live'
        ? 'all_primary_sources_available'
        : fidelityMode === 'degraded'
          ? 'partial_source_coverage'
          : 'no_observed_records';
    const fidelityImpact: 'none' | 'partial' | 'full' =
      fidelityMode === 'live' ? 'none' : fidelityMode === 'degraded' ? 'partial' : 'full';
    const adjustedScore = fidelityMode === 'live' ? score : Math.min(score, 69);
    const adjustedLevel = adjustedScore >= 85 ? 'healthy' : adjustedScore >= 65 ? 'warning' : 'critical';

    return {
      version: '1.0.0',
      generated_at: new Date().toISOString(),
      window: { since_days: sinceDays, top_n: topN },
      controls: {
        coverage_target: coverageTarget,
        loop_warning_threshold: loopWarningThreshold,
        success_target: successTarget,
        provider_health_target: providerHealthTarget,
      },
      data_fidelity: fidelityMode,
      fidelity_reason: fidelityReason,
      fidelity_impact: fidelityImpact,
      health: { score: adjustedScore, level: adjustedLevel, signals },
      coverage: {
        skill_universe_total: universe,
        skills_used_unique: skill.size,
        skill_coverage_ratio: Number(coverage.toFixed(2)),
        tools_used_unique: tool.size,
        models_used_unique: model.size,
        agents_used_unique: agent.size,
        sessions_observed: sessions.size,
      },
      loops: {
        total_estimated_loops: totalLoops,
        sessions_with_loops: sessionsWithLoops,
        avg_loops_per_session: Number((sessions.size > 0 ? totalLoops / sessions.size : 0).toFixed(2)),
        max_loops_single_session: maxLoop,
        termination_reasons: top(termination, topN),
      },
      tokens: {
        input: inTok,
        output: outTok,
        total: totalTok,
        observed_messages: withTokens,
        observed_ratio: pct(withTokens, Math.max(totalMessages, 1)),
        p50_per_message: pctl(perMessageTokens, 50),
        p90_per_message: pctl(perMessageTokens, 90),
        by_model: top(model, topN, modelTokens),
        by_skill: top(skill, topN, skillTokens),
        by_tool: top(tool, topN, toolTokens),
      },
      model_distribution: top(model, topN),
      skill_distribution: top(skill, topN),
      tool_distribution: top(tool, topN),
      pipeline: {
        knowledge_graph: {
          node_estimates: { session: sessions.size, model: model.size, skill: skill.size, tool: tool.size, agent: agent.size, pattern: antiItems.length + posItems.length, error: Math.max(errorMentions, antiTotal) },
          edge_estimate: model.size + skill.size + tool.size + agent.size,
        },
        rl_skills: { general: rlGeneral, task_specific: rlTask, total: rlSkills.length, avg_success_rate: Number(rlSuccessAvg.toFixed(3)) },
        learning: { anti_patterns_total: antiTotal, positive_patterns_total: posTotal },
      },
      automation: {
        delegated_session_ratio: pct(delegatedMessages, Math.max(observedRecords, 1)),
        delegated_messages: delegatedMessages,
        workflow_runs: runStats,
      },
      traceability: {
        traces_with_ids_ratio: pct(traces, Math.max(observedRecords, 1)),
        spans_with_parent_ratio: pct(parentSpans, Math.max(observedRecords, 1)),
        custom_events: customEvents.length,
        signed_events_ratio: pct(signedCustomEvents, Math.max(customEvents.length, 1)),
        valid_signed_events_ratio: pct(validSignedCustomEvents, Math.max(signedCustomEvents, 1)),
        signing_enabled: signingEnabled,
        signing_mode: signingMode,
        plugin_quarantine_active: pluginQuarantineActive,
        plugin_crash_like: pluginCrashLike,
        plugin_degraded_transitions: pluginDegradedTransitions,
        strategy_bypass_active: strategyBypassActive,
        strategy_unhealthy: strategyUnhealthy,
      },
      data_quality: {
        sources: {
          messages: hasMessages,
          skill_rl: hasSkillRl,
          learning: hasLearning,
          provider_status: hasProviderStatus,
          custom_orchestration_events: hasCustomEvents,
        },
      },
      frontier: {
        autonomy_readiness_score: frontierScore,
        governance_score: governanceScore,
        plugin_runtime_score: pluginScore,
        observability_score: observabilityScore,
        adaptation_score: adaptationScore,
        closed_loop_score: closedLoopScore,
        capabilities: {
          schema_enforced: hasConfigSchema && !hasConfigValidationTodo,
          plugin_lifecycle_supervised: hasPluginLifecycle,
          plugin_dependency_graph: hasPluginDependencyGraph,
          plugin_schema_versioned: hasPluginConfigSchema && hasPluginEventSchema,
          ci_drift_gate: hasCiDriftGate,
          fallback_policy_aligned: fallbackOrderAligned,
          deterministic_replay_seeded: replaySeedEnabled,
          event_provenance_signing: signingEnabled,
          event_signing_mode: signingMode,
          plugin_quarantine_clear: pluginQuarantineActive === 0 && pluginCrashLike === 0,
          strategy_resilience_clear: strategyBypassActive === 0,
        },
      },
      integration: {
        plugin_inventory: {
          configured: pluginsConfigured,
          discovered: pluginsDiscovered,
          quarantine_active: pluginQuarantineActive,
          crash_like: pluginCrashLike,
          degraded_transitions: pluginDegradedTransitions,
        },
        strategy_health: {
          active_bypass: strategyBypassActive,
          unhealthy: strategyUnhealthy,
          failure_threshold: Number(strategyRuntimeState?.failure_threshold || 0),
          cooldown_ms: Number(strategyRuntimeState?.cooldown_ms || 0),
        },
        retrieval_quality: {
          available: Boolean(retrievalQuality),
          map_at_k: retrievalMapAtK,
          grounded_recall: retrievalGroundedRecall,
          sample_size: retrievalSampleSize,
          generated_at: retrievalQuality?.generated_at || null,
        },
        fallback_alignment: {
          first_provider_project_config: firstProviderProject || null,
          first_provider_root_config: firstProviderRoot || null,
          aligned: fallbackOrderAligned,
        },
        gaps: integrationGaps,
      },
    };
    };

    const payloadPromise = computePayload();
    if (!noCache) {
      orchestrationInFlight.set(cacheKey, payloadPromise);
    }

    let payload: Record<string, unknown>;
    try {
      payload = await payloadPromise;
    } finally {
      if (!noCache) {
        orchestrationInFlight.delete(cacheKey);
      }
    }

    if (!noCache) {
      orchestrationCache.set(cacheKey, {
        expiresAt: Date.now() + ORCHESTRATION_CACHE_TTL_MS,
        payload,
      });
    }

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ message: 'Failed to build orchestration intelligence report', error: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { events?: EventRecord[]; replace?: boolean };
    const incoming = arr<EventRecord>(body?.events);
    if (!incoming.length) {
      return NextResponse.json({ message: 'No events submitted', accepted: 0 }, { status: 400 });
    }
    const op = path.join(os.homedir(), '.opencode');
    const filePath = path.join(op, 'orchestration-events.json');
    const signingKey = process.env.OPENCODE_EVENT_SIGNING_KEY || '';
    const signingMode = resolveSigningMode();
    const defaultSource = request.headers.get('x-opencode-event-source') || 'unknown';
    if (!fs.existsSync(op)) fs.mkdirSync(op, { recursive: true });

    const existing = readJson<{ version?: string; events?: EventRecord[] }>(filePath, { version: '1.0.0', events: [] });
    const { normalized, normalizationDiagnostics } = normalizeEvents({
      incoming,
      signingKey,
      signingMode,
      defaultSource,
    });

    if (normalized.length === 0) {
      return NextResponse.json(
        {
          message: 'No events accepted by signing policy',
          accepted: 0,
          rejected: incoming.length,
          signing_mode: signingMode,
          diagnostics: normalizationDiagnostics,
        },
        { status: 400 }
      );
    }

    const events = await persistEvents({
      filePath,
      version: existing.version,
      existingEvents: arr<EventRecord>(existing.events),
      replace: Boolean(body?.replace),
      normalized,
    });

    return NextResponse.json({
      message: body?.replace ? 'Events replaced' : 'Events ingested',
      accepted: normalized.length,
      rejected: incoming.length - normalized.length,
      total_events: events.length,
      signing_mode: signingMode,
      provenance: summarizeEventProvenance({ normalized, signingKey, diagnostics: normalizationDiagnostics }),
    });
  } catch (error) {
    return NextResponse.json({ message: 'Failed to ingest events', error: String(error) }, { status: 500 });
  }
}
