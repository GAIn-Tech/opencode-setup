export interface IntegrationGap {
  id: string;
  severity: 'critical' | 'high' | 'medium';
  domain: 'governance' | 'plugins' | 'fallback' | 'telemetry' | 'learning-loop' | 'ci';
  title: string;
  detail: string;
  evidence: string;
  recommended_next_step: string;
}

export interface PolicyEngineResult {
  integrationGaps: IntegrationGap[];
  governanceScore: number;
  pluginScore: number;
  observabilityScore: number;
  adaptationScore: number;
  closedLoopScore: number;
  frontierScore: number;
}

export interface Signal {
  key: string;
  label: string;
  value: number;
  target: number;
  level: 'healthy' | 'warning' | 'critical';
  detail: string;
}

export function evaluatePolicyEngine(options: {
  hasConfigValidationTodo: boolean;
  hasPluginLifecycle: boolean;
  hasPluginDependencyGraph: boolean;
  hasPluginConfigSchema: boolean;
  hasPluginEventSchema: boolean;
  hasConfigSchema: boolean;
  hasCiDriftGate: boolean;
  fallbackOrderAligned: boolean;
  firstProviderProject: string | null;
  firstProviderRoot: string | null;
  pluginQuarantineActive: number;
  pluginCrashLike: number;
  strategyBypassActive: number;
  strategyUnhealthy: number;
  retrievalQuality: Record<string, unknown> | null;
  retrievalMapAtK: number;
  retrievalGroundedRecall: number;
  retrievalSampleSize: number;
  pluginsConfigured: number;
  pluginsDiscovered: number;
  score: number;
  signals: Signal[];
  rlSuccessAvg: number;
  antiTotal: number;
  posTotal: number;
}): PolicyEngineResult;
