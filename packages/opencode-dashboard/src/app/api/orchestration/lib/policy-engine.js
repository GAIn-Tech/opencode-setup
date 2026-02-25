export function evaluatePolicyEngine({
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
}) {
  const integrationGaps = [];

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

  const observabilityScore = Math.round(signals[4].value * 0.6 + signals[3].value * 0.2 + signals[2].value * 0.2);
  const adaptationScore = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        Number(rlSuccessAvg.toFixed(3)) * 100 * 0.45 +
          Math.min(100, ((posTotal / Math.max(antiTotal + posTotal, 1)) * 100).toFixed(2)) * 0.3 +
          signals[1].value * 0.25
      )
    )
  );
  const closedLoopScore = Math.round(signals[4].value * 0.5 + signals[0].value * 0.3 + signals[2].value * 0.2);

  const frontierScore = Math.round(
    governanceScore * 0.2 + pluginScore * 0.2 + observabilityScore * 0.2 + adaptationScore * 0.2 + closedLoopScore * 0.2
  );

  return {
    integrationGaps,
    governanceScore,
    pluginScore,
    observabilityScore,
    adaptationScore,
    closedLoopScore,
    frontierScore,
  };
}
