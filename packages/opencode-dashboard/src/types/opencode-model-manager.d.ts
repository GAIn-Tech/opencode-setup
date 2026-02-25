declare module 'opencode-model-manager/lifecycle' {
  export class StateMachine {
    constructor(options?: { dbPath?: string });
    getState(modelId: string): Promise<string | null>;
    getHistory(modelId: string): Promise<unknown[]>;
    canTransition(modelId: string, toState: string, context?: Record<string, unknown>): Promise<boolean>;
    transition(modelId: string, toState: string, context?: Record<string, unknown>): Promise<string>;
    close(): void;
  }

  export class AuditLogger {
    constructor(options?: { dbPath?: string; retentionDays?: number });
    getByModel(modelId: string): Promise<unknown[]>;
    getByTimeRange(startTime: number, endTime: number): Promise<unknown[]>;
    log(entry: {
      modelId: string;
      fromState: string;
      toState: string;
      actor: string;
      reason: string;
      diffHash: string;
      timestamp: number;
      metadata?: Record<string, unknown>;
    }): Promise<unknown>;
    close(): void;
  }
}

declare module 'opencode-model-manager/monitoring' {
  export class PipelineMetricsCollector {
    constructor(options?: Record<string, unknown>);
    toPrometheus(windowMs?: number): string;
    getSnapshot(windowMs?: number): Record<string, unknown>;
    recordDiscovery(provider: string, success: boolean, metadata?: Record<string, unknown>): void;
    recordCacheAccess(tier: string, result: string, key?: string): void;
    recordTransition(modelId: string, fromState: string, toState: string): void;
    recordPRCreation(success: boolean, metadata?: Record<string, unknown>): void;
  }

  export class AlertManager {
    constructor(options?: Record<string, unknown>);
    evaluate(collector: PipelineMetricsCollector): unknown[];
    getActiveAlerts(): unknown[];
    getSummary(): Record<string, unknown>;
    getAlertHistory(limit?: number): unknown[];
  }
}
