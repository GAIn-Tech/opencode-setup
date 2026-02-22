import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getDataSource } from '@/lib/data-sources';

export const dynamic = 'force-dynamic';

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

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(obj[key])}`);
  return `{${parts.join(',')}}`;
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function hmacSha256(input: string, key: string): string {
  return crypto.createHmac('sha256', key).update(input).digest('hex');
}

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
  const fallbackModels = arr<any>((json as any).fallbackModels ?? (json as any).fallback_models ?? []);
  if (fallbackModels.length > 0) {
    const first = fallbackModels[0];
    const provider = String(first?.provider || '').trim();
    if (provider) return provider.toLowerCase();
    const model = String(first?.model || '').trim();
    if (model.includes('/')) return model.split('/')[0]!.toLowerCase();
  }
  const priority = arr<any>((json as any).provider_priority ?? (json as any).providerPriority ?? []);
  if (priority.length > 0) return String(priority[0]).toLowerCase();
  return '';
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
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

    const sessions = new Set<string>();
    const model = new Map<string, number>();
    const skill = new Map<string, number>();
    const tool = new Map<string, number>();
    const agent = new Map<string, number>();
    const termination = new Map<string, number>();
    const modelTokens = new Map<string, number>();
    const skillTokens = new Map<string, number>();
    const toolTokens = new Map<string, number>();
    const loopsBySession = new Map<string, number>();
    const perMessageTokens: number[] = [];

    let totalMessages = 0;
    let delegatedMessages = 0;
    let traces = 0;
    let parentSpans = 0;
    let errorMentions = 0;
    let signedCustomEvents = 0;
    let validSignedCustomEvents = 0;
    let withTokens = 0;
    let inTok = 0;
    let outTok = 0;
    let totalTok = 0;

    if (fs.existsSync(messagesPath)) {
      const dirs = fs.readdirSync(messagesPath).filter((entry) => {
        try {
          const stat = fs.statSync(path.join(messagesPath, entry));
          return stat.isDirectory() && stat.mtimeMs >= cutoffMs;
        } catch {
          return false;
        }
      });

      for (const sessionId of dirs) {
        sessions.add(sessionId);
        let maxLoop = 0;
        const files = fs.readdirSync(path.join(messagesPath, sessionId)).filter((f) => f.endsWith('.json'));
        for (const fileName of files) {
          try {
            const raw = JSON.parse(fs.readFileSync(path.join(messagesPath, sessionId, fileName), 'utf-8')) as any;
            totalMessages += 1;
            const a = String(raw?.agent || '').trim();
            if (a) {
              agent.set(a, (agent.get(a) ?? 0) + 1);
              if (!/^(main|assistant|system)$/i.test(a)) delegatedMessages += 1;
            }
            const m = typeof raw?.model === 'string' ? raw.model : String(raw?.model?.modelID || raw?.model?.id || '').trim();
            if (m) model.set(m, (model.get(m) ?? 0) + 1);
            const messageSkills = arr<any>(raw?.skills)
              .map((s) => (typeof s === 'string' ? s : String(s?.name || s?.id || '').trim()))
              .filter(Boolean);
            for (const id of messageSkills) {
              skill.set(id, (skill.get(id) ?? 0) + 1);
            }

            const messageTools = arr<any>(raw?.tools)
              .map((t) => (typeof t === 'string' ? t : String(t?.name || t?.id || '').trim()))
              .filter(Boolean);
            for (const id of messageTools) {
              tool.set(id, (tool.get(id) ?? 0) + 1);
            }
            if (raw?.trace_id || raw?.traceId || raw?.traceID) traces += 1;
            if ((raw?.span_id || raw?.spanId) && (raw?.parent_span_id || raw?.parentSpanId)) parentSpans += 1;
            const usage = raw?.usage || raw?.tokenUsage || {};
            const input = n(usage?.input_tokens ?? usage?.inputTokens ?? raw?.input_tokens ?? raw?.prompt_tokens, 0);
            const output = n(usage?.output_tokens ?? usage?.outputTokens ?? raw?.output_tokens ?? raw?.completion_tokens, 0);
            const total = n(usage?.total_tokens ?? usage?.totalTokens ?? raw?.total_tokens, input + output);
            if (total > 0) {
              withTokens += 1;
              inTok += input;
              outTok += output;
              totalTok += total;
              perMessageTokens.push(total);
              if (m) modelTokens.set(m, (modelTokens.get(m) ?? 0) + total);
              const skillTokenShare = messageSkills.length > 0 ? total / messageSkills.length : 0;
              const toolTokenShare = messageTools.length > 0 ? total / messageTools.length : 0;
              for (const name of messageSkills) {
                skillTokens.set(name, (skillTokens.get(name) ?? 0) + skillTokenShare);
              }
              for (const name of messageTools) {
                toolTokens.set(name, (toolTokens.get(name) ?? 0) + toolTokenShare);
              }
            }
            const loopIndex = Math.max(n(raw?.iteration_index, 0), n(raw?.iterationIndex, 0), n(raw?.loopIndex, 0), n(raw?.attempt, 0));
            const hasLoopKeyword = /\b(loop|retry|replan|iterate|attempt)\b/.test(JSON.stringify(raw).toLowerCase());
            if (loopIndex > 0 || hasLoopKeyword) maxLoop = Math.max(maxLoop, loopIndex > 0 ? loopIndex : 1);
            const reason = String(raw?.termination_reason || raw?.terminationReason || raw?.finish_reason || raw?.stop_reason || '').trim();
            if (reason) termination.set(reason, (termination.get(reason) ?? 0) + 1);
            if (/\b(error|failed|exception|timeout|denied|unreachable)\b/.test(JSON.stringify(raw).toLowerCase())) errorMentions += 1;
          } catch {
            // ignore malformed records
          }
        }
        loopsBySession.set(sessionId, maxLoop);
      }
    }

    const customEvents = (readJson<{ events?: EventRecord[] }>(customEventsPath, { events: [] }).events || []).filter((event) => {
      if (!event.timestamp) return true;
      const ts = Date.parse(event.timestamp);
      return Number.isNaN(ts) || ts >= cutoffMs;
    });
    for (const event of customEvents) {
      if (event.trace_id) traces += 1;
      if (event.span_id && event.parent_span_id) parentSpans += 1;
      if (event.model) model.set(event.model, (model.get(event.model) ?? 0) + 1);
      if (event.skill) skill.set(event.skill, (skill.get(event.skill) ?? 0) + 1);
      if (event.tool) tool.set(event.tool, (tool.get(event.tool) ?? 0) + 1);
      const customTotal = n(event.total_tokens, n(event.input_tokens, 0) + n(event.output_tokens, 0));
      if (customTotal > 0) {
        withTokens += 1;
        inTok += n(event.input_tokens, 0);
        outTok += n(event.output_tokens, 0);
        totalTok += customTotal;
        perMessageTokens.push(customTotal);
        if (event.model) modelTokens.set(event.model, (modelTokens.get(event.model) ?? 0) + customTotal);
        if (event.skill) skillTokens.set(event.skill, (skillTokens.get(event.skill) ?? 0) + customTotal);
        if (event.tool) toolTokens.set(event.tool, (toolTokens.get(event.tool) ?? 0) + customTotal);
      }
      if (event.termination_reason) {
        termination.set(event.termination_reason, (termination.get(event.termination_reason) ?? 0) + 1);
      }
      const signature = String(event?.provenance?.signature || '').trim();
      if (signature) {
        signedCustomEvents += 1;
        if (event?.provenance?.signature_valid === true) {
          validSignedCustomEvents += 1;
        }
      }
    }

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

    const runs = await getDataSource().getRuns();
    const runStats = runs.reduce(
      (acc, run) => {
        acc.total += 1;
        if (run.status === 'running') acc.active += 1;
        else if (run.status === 'failed') acc.failed += 1;
        else acc.completed += 1;
        return acc;
      },
      { total: 0, active: 0, completed: 0, failed: 0 }
    );

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
    const strategyRuntimeState = readJson<any>(strategyRuntimeStatePath, {});
    const strategyEntries = Object.values(strategyRuntimeState?.entries || {});
    const strategyBypassActive = strategyEntries.filter((entry: any) => Number(entry?.bypass_until || 0) > Date.now()).length;
    const strategyUnhealthy = strategyEntries.filter((entry: any) => Number(entry?.consecutive_failures || 0) > 0).length;
    const retrievalQuality = readJson<any>(retrievalQualityPath, null);
    const retrievalMapAtK = Number(retrievalQuality?.map_at_k || 0);
    const retrievalGroundedRecall = Number(retrievalQuality?.grounded_recall || 0);
    const retrievalSampleSize = Number(retrievalQuality?.sample_size || 0);
    const firstProviderProject = parseFallbackFirstProvider(fallbackConfigProject);
    const firstProviderRoot = parseFallbackFirstProvider(fallbackConfigRoot);
    const fallbackOrderAligned = !firstProviderProject || !firstProviderRoot || firstProviderProject === firstProviderRoot;

    const integrationGaps: IntegrationGap[] = [];
    if (hasConfigValidationTodo) {
      integrationGaps.push({
        id: 'config-validation-runtime',
        severity: 'critical',
        domain: 'governance',
        title: 'Runtime config validation remains incomplete',
        detail: 'Core orchestration config can still load without strict schema enforcement.',
        evidence: 'opencode-config/docs/configuration-precedence.md still contains unchecked config-validation TODO.',
        recommended_next_step: 'Enforce schema validation at startup and fail-fast on invalid config.',
      });
    }
    if (!hasPluginLifecycle) {
      integrationGaps.push({
        id: 'plugin-lifecycle-supervision',
        severity: 'critical',
        domain: 'plugins',
        title: 'No dedicated plugin lifecycle supervisor detected',
        detail: 'Plugin init/health/degrade/recover behaviors are not centralized.',
        evidence: 'packages/opencode-plugin-lifecycle not found.',
        recommended_next_step: 'Introduce a lifecycle manager with heartbeat, dependency checks, and failure isolation.',
      });
    }
    if (pluginQuarantineActive > 0 || pluginCrashLike > 0) {
      integrationGaps.push({
        id: 'plugin-quarantine-pressure',
        severity: 'high',
        domain: 'plugins',
        title: 'Plugin quarantine/crash pressure detected',
        detail: 'Runtime plugin state includes quarantined or crash-like entries.',
        evidence: `quarantine_active=${pluginQuarantineActive}, crash_like=${pluginCrashLike}`,
        recommended_next_step: 'Stabilize failing plugins and enforce quarantine reason-code review before re-enable.',
      });
    }
    if (strategyBypassActive > 0) {
      integrationGaps.push({
        id: 'strategy-bypass-active',
        severity: 'high',
        domain: 'telemetry',
        title: 'Strategy auto-bypass is currently active',
        detail: 'One or more orchestration strategies are under cooldown due to repeated failures.',
        evidence: `active_bypass=${strategyBypassActive}, unhealthy=${strategyUnhealthy}`,
        recommended_next_step: 'Stabilize failing strategy and verify cooldown recovery before strict policy promotions.',
      });
    }
    if (!retrievalQuality || retrievalSampleSize <= 0 || retrievalMapAtK < 0.5 || retrievalGroundedRecall < 0.6) {
      integrationGaps.push({
        id: 'retrieval-quality-weak',
        severity: 'medium',
        domain: 'learning-loop',
        title: 'Retrieval quality baseline is weak or missing',
        detail: 'MAP@K / grounded recall metrics are below target or not yet generated.',
        evidence: `map_at_k=${retrievalMapAtK}, grounded_recall=${retrievalGroundedRecall}, sample_size=${retrievalSampleSize}`,
        recommended_next_step: 'Run fg11 retrieval evaluation and improve retrieval ranking quality before policy promotions.',
      });
    }
    if (!hasPluginDependencyGraph) {
      integrationGaps.push({
        id: 'plugin-dependency-graph',
        severity: 'high',
        domain: 'plugins',
        title: 'Plugin dependency graph is missing',
        detail: 'Inter-plugin contracts and startup order are not machine-verifiable.',
        evidence: 'opencode-config/plugin-dependency-graph.json not found.',
        recommended_next_step: 'Add dependency graph + CI validation for cycles and missing deps.',
      });
    }
    if (!hasPluginConfigSchema || !hasPluginEventSchema) {
      integrationGaps.push({
        id: 'plugin-schema-governance',
        severity: 'high',
        domain: 'plugins',
        title: 'Plugin config/event schemas are not fully governed',
        detail: 'Without canonical schema contracts, plugin telemetry and control-plane behavior drift over time.',
        evidence: `plugin-config-schema=${hasPluginConfigSchema}, plugin-event-schema=${hasPluginEventSchema}`,
        recommended_next_step: 'Define versioned plugin config + event schemas and enforce on ingest.',
      });
    }
    if (!fallbackOrderAligned) {
      integrationGaps.push({
        id: 'fallback-policy-drift',
        severity: 'high',
        domain: 'fallback',
        title: 'Fallback ordering differs across configs',
        detail: 'Different fallback roots increase nondeterministic model selection behavior.',
        evidence: `first provider mismatch: project=${firstProviderProject || 'n/a'} root=${firstProviderRoot || 'n/a'}`,
        recommended_next_step: 'Consolidate fallback source-of-truth and auto-generate secondary configs.',
      });
    }
    if (!hasCiDriftGate) {
      integrationGaps.push({
        id: 'ci-drift-gate',
        severity: 'medium',
        domain: 'ci',
        title: 'Config drift gate is not enforced in CI',
        detail: 'Manual sync processes can miss silent divergence between runtime and repo configs.',
        evidence: '.github/workflows/config-drift-check.yml not found.',
        recommended_next_step: 'Add CI drift check for config schema, model policies, and fallback files.',
      });
    }

    const configCoverageSignals = [hasConfigSchema, hasPluginConfigSchema, hasPluginEventSchema, hasPluginDependencyGraph];
    const governanceScore = Math.round((configCoverageSignals.filter(Boolean).length / configCoverageSignals.length) * 100);
    const pluginReadinessSignals = [
      hasPluginLifecycle,
      pluginsConfigured > 0,
      pluginsDiscovered > 0,
      pluginsConfigured <= pluginsDiscovered || pluginsDiscovered === 0,
      pluginQuarantineActive === 0,
      pluginCrashLike === 0,
      strategyBypassActive === 0,
    ];
    const pluginScore = Math.round((pluginReadinessSignals.filter(Boolean).length / pluginReadinessSignals.length) * 100);
    const observabilityScore = Math.round((signals[4].value * 0.6 + signals[3].value * 0.2 + signals[2].value * 0.2));
    const adaptationScore = Math.round(
      Math.max(0, Math.min(100, ((Number(rlSuccessAvg.toFixed(3)) * 100) * 0.45) + (Math.min(100, pct(posTotal, Math.max(antiTotal + posTotal, 1))) * 0.3) + (signals[1].value * 0.25)))
    );
    const closedLoopScore = Math.round((signals[4].value * 0.5 + signals[0].value * 0.3 + signals[2].value * 0.2));

    const frontierScore = Math.round(
      governanceScore * 0.2 + pluginScore * 0.2 + observabilityScore * 0.2 + adaptationScore * 0.2 + closedLoopScore * 0.2
    );

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

    return NextResponse.json({
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
    });
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
    const normalizationDiagnostics = {
      unsigned: 0,
      invalid_signature: 0,
      accepted_signed: 0,
      accepted_unsigned: 0,
    };

    const normalized = incoming
      .map((event) => ({
        ...event,
        timestamp: event.timestamp || new Date().toISOString(),
        input_tokens: n(event.input_tokens, 0),
        output_tokens: n(event.output_tokens, 0),
        total_tokens: n(event.total_tokens, n(event.input_tokens, 0) + n(event.output_tokens, 0)),
        iteration_index: n(event.iteration_index, 0),
      }))
      .map((event) => {
      const envelope = {
        timestamp: event.timestamp,
        trace_id: event.trace_id,
        span_id: event.span_id,
        parent_span_id: event.parent_span_id,
        model: event.model,
        skill: event.skill,
        tool: event.tool,
        input_tokens: event.input_tokens,
        output_tokens: event.output_tokens,
        total_tokens: event.total_tokens,
        iteration_index: event.iteration_index,
        termination_reason: event.termination_reason,
      };

      const eventHash = sha256(canonicalStringify(envelope));
      const incomingSignature = String(event?.provenance?.signature || '').trim();
      const computedSignature = signingKey ? hmacSha256(eventHash, signingKey) : '';
      const signatureToStore = incomingSignature || computedSignature;
      const signatureValid = signingKey
        ? Boolean(signatureToStore) && signatureToStore === computedSignature
        : Boolean(signatureToStore);

      if (!signatureToStore) {
        normalizationDiagnostics.unsigned += 1;
      } else if (!signatureValid) {
        normalizationDiagnostics.invalid_signature += 1;
      }

      return {
        ...event,
        provenance: {
          source: event?.provenance?.source || defaultSource,
          event_hash: eventHash,
          signature: signatureToStore || undefined,
          signature_valid: signatureValid,
          signing_algorithm: signatureToStore ? (signingKey ? 'hmac-sha256' : 'external') : 'none',
          received_at: new Date().toISOString(),
          signer: signingKey ? 'opencode-local' : undefined,
        },
      };
      })
      .filter((event) => {
        const hasSignature = Boolean(event?.provenance?.signature);
        const validSignature = event?.provenance?.signature_valid === true;

        if (signingMode === 'off' || signingMode === 'allow-unsigned') {
          if (hasSignature) normalizationDiagnostics.accepted_signed += 1;
          else normalizationDiagnostics.accepted_unsigned += 1;
          return true;
        }

        if (signingMode === 'require-signed') {
          if (!hasSignature) return false;
          normalizationDiagnostics.accepted_signed += 1;
          return true;
        }

        if (signingMode === 'require-valid-signature') {
          if (!hasSignature || !validSignature) return false;
          normalizationDiagnostics.accepted_signed += 1;
          return true;
        }

        return true;
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

    const events = body?.replace ? normalized : [...arr<EventRecord>(existing.events), ...normalized].slice(-10000);
    fs.writeFileSync(filePath, JSON.stringify({ version: existing.version || '1.0.0', updated_at: new Date().toISOString(), events }, null, 2));

    const signed = normalized.filter((event) => Boolean(event?.provenance?.signature)).length;
    const valid = normalized.filter((event) => event?.provenance?.signature_valid === true).length;

    return NextResponse.json({
      message: body?.replace ? 'Events replaced' : 'Events ingested',
      accepted: normalized.length,
      rejected: incoming.length - normalized.length,
      total_events: events.length,
      signing_mode: signingMode,
      provenance: {
        signing_enabled: Boolean(signingKey),
        signed_events: signed,
        valid_signed_events: valid,
        diagnostics: normalizationDiagnostics,
      },
    });
  } catch (error) {
    return NextResponse.json({ message: 'Failed to ingest events', error: String(error) }, { status: 500 });
  }
}
