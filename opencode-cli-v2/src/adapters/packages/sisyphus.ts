import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { PackageAdapter } from '../base';
import type { AdapterHealthInput } from '../health';
import {
  AgentConfigSchema,
  AgentIdSchema,
  ReplayOptionsSchema,
  TaskIdSchema,
  TaskResultSchema,
  TrajectorySchema,
  type AgentConfig,
  type AgentId,
  type AgentStatus,
  type OrchestrationPort,
  type Task,
  type TaskResult,
  type TaskStatus,
  type Trajectory
} from '../../ports/orchestration';
import {
  createSisyphusAdapterError,
  normalizeSisyphusAdapterError,
  type SisyphusAdapterErrorInit
} from './sisyphus-errors';
import {
  LEGACY_AGENT_WORKFLOW_PREFIX,
  LEGACY_TASK_STEP_TYPE,
  LegacyRunStatusSchema,
  createLegacyTaskWorkflow,
  createTrajectoryEvent,
  isRecord,
  mapLegacyRunStatusToAgentStatus,
  mapLegacyRunStatusToTaskStatus,
  normalizeAgentConfigFromLegacyInput,
  normalizeTask,
  normalizeTaskStatus,
  parseLegacySisyphusModule,
  safeParseLegacyRunState,
  snapshotToAgentInfo,
  toIsoDateTime,
  type AgentSnapshot,
  type LegacyExecutionResult,
  type LegacySisyphusModule,
  type LegacyWorkflowDefinition,
  type LegacyWorkflowExecutor,
  type LegacyWorkflowStore
} from './sisyphus-mappings';

const DEFAULT_LEGACY_MODULE_PATH = '../../../../packages/opencode-sisyphus-state/src/index.js';

const LegacyTaskStepSchema = z.object({
  taskId: TaskIdSchema
});

class TaskTimeoutError extends Error {
  public readonly timeoutMs: number;

  public constructor(timeoutMs: number) {
    super(`Task execution timed out after ${timeoutMs}ms`);
    this.name = 'TaskTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

type TaskRunner = (
  task: Task,
  context: Record<string, unknown>
) => Promise<unknown>;

interface SisyphusRuntime {
  readonly store: LegacyWorkflowStore;
  readonly executor: LegacyWorkflowExecutor;
}

interface AgentRuntimeRecord {
  readonly id: AgentId;
  readonly config: AgentConfig;
  status: AgentStatus;
  readonly startedAt: string;
  finishedAt?: string;
}

interface TaskRuntimeRecord {
  readonly id: string;
  readonly task: Task;
  readonly workflow: LegacyWorkflowDefinition;
  status: TaskStatus;
  readonly startedAt: string;
  completedAt?: string;
  output?: unknown;
  error?: string;
}

export interface SisyphusAdapterOptions {
  readonly dbPath?: string;
  readonly modulePath?: string;
  readonly loadLegacyModule?: () => Promise<unknown>;
  readonly taskRunner?: TaskRunner;
  readonly idFactory?: () => string;
}

export class SisyphusAdapter extends PackageAdapter<OrchestrationPort> {
  public readonly name = 'opencode-sisyphus-state';
  public readonly version = '1.0.0';
  public readonly portType = Symbol.for('orchestration');
  public readonly required = true;

  private legacyModule?: LegacySisyphusModule;
  private runtime?: SisyphusRuntime;

  private readonly taskRunner: TaskRunner;
  private readonly idFactory: () => string;

  private readonly agentRecords = new Map<AgentId, AgentRuntimeRecord>();
  private readonly taskRecords = new Map<string, TaskRuntimeRecord>();
  private readonly taskTrajectoryEvents = new Map<string, Trajectory['events']>();
  private readonly cancelledTaskIds = new Set<string>();
  private readonly killedAgentIds = new Set<AgentId>();

  public constructor(private readonly options: SisyphusAdapterOptions = {}) {
    super();
    this.taskRunner = options.taskRunner ?? ((task) => Promise.resolve(task.payload));
    this.idFactory = options.idFactory ?? randomUUID;
  }

  public async load(): Promise<void> {
    try {
      const moduleCandidate = await this.loadLegacyModule();
      this.legacyModule = parseLegacySisyphusModule(moduleCandidate);
    } catch (error: unknown) {
      throw normalizeSisyphusAdapterError(error, {
        code: 'UNKNOWN',
        message: 'Failed to load legacy opencode-sisyphus-state module',
        details: {
          modulePath: this.getLegacyModulePath()
        }
      });
    }
  }

  public initialize(): Promise<void> {
    if (!this.legacyModule) {
      throw createSisyphusAdapterError({
        code: 'UNKNOWN',
        message: 'Cannot initialize Sisyphus adapter before module load'
      });
    }

    try {
      const store = new this.legacyModule.WorkflowStore(this.options.dbPath);
      const executor = new this.legacyModule.WorkflowExecutor(store, {
        [LEGACY_TASK_STEP_TYPE]: async (step, context) => this.handleLegacyTaskStep(step, context)
      });

      this.runtime = {
        store,
        executor
      };

      this.setPort(this.createPort());
      return Promise.resolve();
    } catch (error: unknown) {
      throw normalizeSisyphusAdapterError(error, {
        code: 'UNKNOWN',
        message: 'Failed to initialize legacy Sisyphus runtime'
      });
    }
  }

  public healthCheck(): Promise<AdapterHealthInput> {
    const runtime = this.runtime;
    if (!runtime) {
      return Promise.resolve({
        status: 'unhealthy',
        details: 'Sisyphus runtime is not initialized'
      });
    }

    try {
      const probeRunId = `adapter-health-${this.idFactory()}`;
      runtime.store.createRun('adapter-health-check', { probe: true }, probeRunId);
      runtime.store.updateRunStatus(probeRunId, 'completed');

      return Promise.resolve({
        status: 'healthy'
      });
    } catch (error: unknown) {
      return Promise.resolve({
        status: 'unhealthy',
        details: this.errorMessage(error)
      });
    }
  }

  public async shutdown(): Promise<void> {
    if (this.runtime?.store.close) {
      await this.runtime.store.close();
    }

    this.runtime = undefined;
    this.legacyModule = undefined;

    this.agentRecords.clear();
    this.taskRecords.clear();
    this.taskTrajectoryEvents.clear();
    this.cancelledTaskIds.clear();
    this.killedAgentIds.clear();
  }

  private createPort(): OrchestrationPort {
    return {
      spawnAgent: (config) => this.toPromise(() => this.spawnAgent(config)),
      killAgent: (id) => this.toPromise(() => this.killAgent(id)),
      getAgentStatus: (id) => this.toPromise(() => this.getAgentStatus(id)),
      listAgents: () => this.toPromise(() => this.listAgents()),
      executeTask: (task) => this.toPromise(() => this.executeTask(task)),
      cancelTask: (id) => this.toPromise(() => this.cancelTask(id)),
      getTaskStatus: (id) => this.toPromise(() => this.getTaskStatus(id)),
      getTrajectory: (id) => this.toPromise(() => this.getTrajectory(id)),
      replayTrajectory: (id, options) => this.toPromise(() => this.replayTrajectory(id, options))
    };
  }

  private spawnAgent(config: AgentConfig): AgentId {
    const runtime = this.requireRuntime();
    const parsedConfig = this.parseWithSchema(
      AgentConfigSchema,
      config,
      'Invalid agent configuration payload'
    );
    const agentId = this.parseWithSchema(
      AgentIdSchema,
      this.idFactory(),
      'Generated invalid agent id'
    );

    try {
      runtime.store.createRun(
        `${LEGACY_AGENT_WORKFLOW_PREFIX}${parsedConfig.type}`,
        {
          agentConfig: parsedConfig
        },
        agentId
      );

      runtime.store.logEvent(agentId, 'agent_spawned', {
        type: parsedConfig.type,
        task: parsedConfig.task
      });

      this.agentRecords.set(agentId, {
        id: agentId,
        config: parsedConfig,
        status: 'running',
        startedAt: this.nowIso()
      });

      return agentId;
    } catch (error: unknown) {
      throw normalizeSisyphusAdapterError(error, {
        code: 'AGENT_SPAWN_FAILED',
        message: `Failed to spawn legacy agent: ${parsedConfig.type}`,
        details: {
          agentId,
          type: parsedConfig.type
        }
      });
    }
  }

  private killAgent(id: AgentId): void {
    const runtime = this.requireRuntime();
    const agentId = this.parseWithSchema(AgentIdSchema, id, 'Invalid agent id');
    const record = this.agentRecords.get(agentId) ?? this.hydrateAgentRecord(agentId);

    if (!record) {
      throw createSisyphusAdapterError({
        code: 'AGENT_NOT_FOUND',
        message: `Agent not found: ${agentId}`,
        details: {
          agentId
        }
      });
    }

    try {
      runtime.store.updateRunStatus(agentId, 'failed');
      runtime.store.logEvent(agentId, 'agent_killed', {
        reason: 'killAgent requested via OrchestrationPort'
      });
    } catch (error: unknown) {
      throw normalizeSisyphusAdapterError(error, {
        code: 'AGENT_SPAWN_FAILED',
        message: `Failed to terminate agent: ${agentId}`,
        details: {
          agentId
        }
      });
    }

    this.killedAgentIds.add(agentId);
    record.status = 'cancelled';
    record.finishedAt = this.nowIso();
    this.agentRecords.set(agentId, record);
  }

  private getAgentStatus(id: AgentId): AgentStatus {
    const runtime = this.requireRuntime();
    const agentId = this.parseWithSchema(AgentIdSchema, id, 'Invalid agent id');

    const record = this.agentRecords.get(agentId) ?? this.hydrateAgentRecord(agentId);
    if (!record) {
      throw createSisyphusAdapterError({
        code: 'AGENT_NOT_FOUND',
        message: `Agent not found: ${agentId}`,
        details: {
          agentId
        }
      });
    }

    const runState = safeParseLegacyRunState(runtime.store.getRunState(agentId));
    if (runState) {
      record.status = mapLegacyRunStatusToAgentStatus(runState.status, {
        cancelled: this.killedAgentIds.has(agentId)
      });

      if (record.status === 'completed' || record.status === 'failed' || record.status === 'cancelled') {
        record.finishedAt = record.finishedAt ?? toIsoDateTime(runState.updated_at, this.nowIso());
      }
    }

    this.agentRecords.set(agentId, record);
    return record.status;
  }

  private listAgents(): ReturnType<typeof snapshotToAgentInfo>[] {
    return [...this.agentRecords.values()]
      .map((record): AgentSnapshot => ({
        id: record.id,
        status: record.status,
        config: record.config,
        startedAt: record.startedAt,
        finishedAt: record.finishedAt
      }))
      .map((snapshot) => snapshotToAgentInfo(snapshot));
  }

  private async executeTask(task: Task): Promise<TaskResult> {
    const runtime = this.requireRuntime();

    const normalized = this.parseTask(task);
    const taskId = this.parseWithSchema(TaskIdSchema, normalized.id, 'Task id is required');
    const workflow = createLegacyTaskWorkflow(normalized);

    const record: TaskRuntimeRecord = {
      id: taskId,
      task: normalized,
      workflow,
      status: 'queued',
      startedAt: this.nowIso()
    };

    this.taskRecords.set(taskId, record);
    this.cancelledTaskIds.delete(taskId);
    this.pushTaskEvent(taskId, 'task_queued', `Task queued: ${normalized.type}`, {
      priority: normalized.priority
    });

    try {
      record.status = 'running';
      this.pushTaskEvent(taskId, 'task_started', `Task started: ${normalized.type}`);

      const executionPromise = runtime.executor.execute(workflow, { taskId }, taskId);
      const executionResult = await this.runWithOptionalTimeout(executionPromise, normalized.timeoutMs);

      const runState = safeParseLegacyRunState(runtime.store.getRunState(taskId));
      const legacyStatus =
        runState?.status ?? this.legacyStatusFromUnknown(executionResult.status, 'completed');
      const mappedStatus = mapLegacyRunStatusToTaskStatus(legacyStatus, {
        cancelled: this.cancelledTaskIds.has(taskId)
      });

      record.status = normalizeTaskStatus(mappedStatus);
      record.completedAt = this.nowIso();

      if (isRecord(executionResult.context) && 'output' in executionResult.context) {
        record.output = executionResult.context.output;
      }

      if (record.status === 'cancelled') {
        record.error = 'Task cancelled';
      }

      this.pushTaskEvent(taskId, 'task_completed', `Task completed with status ${record.status}`, {
        status: record.status
      });

      return this.toTaskResult(record);
    } catch (error: unknown) {
      if (error instanceof TaskTimeoutError) {
        record.status = 'timed_out';
        record.error = error.message;
        record.completedAt = this.nowIso();
        this.tryFailLegacyRun(taskId);
        this.pushTaskEvent(taskId, 'task_timed_out', error.message, {
          timeoutMs: error.timeoutMs
        });

        return this.toTaskResult(record);
      }

      if (this.cancelledTaskIds.has(taskId)) {
        record.status = 'cancelled';
        record.error = 'Task cancelled';
        record.completedAt = this.nowIso();
        this.tryFailLegacyRun(taskId);
        this.pushTaskEvent(taskId, 'task_cancelled', `Task cancelled: ${taskId}`);

        return this.toTaskResult(record);
      }

      record.status = 'failed';
      record.error = this.errorMessage(error);
      record.completedAt = this.nowIso();
      this.pushTaskEvent(taskId, 'task_failed', `Task failed: ${record.error}`);

      return this.toTaskResult(record);
    }
  }

  private cancelTask(id: string): void {
    const runtime = this.requireRuntime();
    const taskId = this.parseWithSchema(TaskIdSchema, id, 'Invalid task id');

    const record = this.taskRecords.get(taskId);
    const runState = safeParseLegacyRunState(runtime.store.getRunState(taskId));

    if (!record && !runState) {
      throw createSisyphusAdapterError({
        code: 'TASK_NOT_FOUND',
        message: `Task not found: ${taskId}`,
        details: {
          taskId
        }
      });
    }

    this.cancelledTaskIds.add(taskId);
    this.pushTaskEvent(taskId, 'task_cancelled', `Task cancelled by caller: ${taskId}`);

    if (record) {
      record.status = 'cancelled';
      record.completedAt = record.completedAt ?? this.nowIso();
      record.error = record.error ?? 'Task cancelled';
    }

    try {
      runtime.store.logEvent(taskId, 'task_cancelled', {
        reason: 'cancelTask requested via OrchestrationPort'
      });
      runtime.store.updateRunStatus(taskId, 'failed');
    } catch {
      // Best effort cancellation - legacy runtime has no native cancellation state.
    }
  }

  private getTaskStatus(id: string): TaskStatus {
    const runtime = this.requireRuntime();
    const taskId = this.parseWithSchema(TaskIdSchema, id, 'Invalid task id');

    const record = this.taskRecords.get(taskId);
    if (record) {
      return record.status;
    }

    const runState = safeParseLegacyRunState(runtime.store.getRunState(taskId));
    if (!runState) {
      throw createSisyphusAdapterError({
        code: 'TASK_NOT_FOUND',
        message: `Task not found: ${taskId}`,
        details: {
          taskId
        }
      });
    }

    return mapLegacyRunStatusToTaskStatus(runState.status, {
      cancelled: this.cancelledTaskIds.has(taskId)
    });
  }

  private getTrajectory(id: string): Trajectory {
    const taskId = this.parseWithSchema(TaskIdSchema, id, 'Invalid task id');
    const events = this.taskTrajectoryEvents.get(taskId);

    if (!events || events.length === 0) {
      throw createSisyphusAdapterError({
        code: 'TRAJECTORY_NOT_FOUND',
        message: `No trajectory recorded for task: ${taskId}`,
        details: {
          taskId
        }
      });
    }

    const taskRecord = this.taskRecords.get(taskId);
    return TrajectorySchema.parse({
      taskId,
      events,
      summary: taskRecord
        ? `Task ${taskRecord.task.type} current status: ${taskRecord.status}`
        : `Trajectory available for task ${taskId}`
    });
  }

  private async replayTrajectory(id: string, options: unknown): Promise<void> {
    const runtime = this.requireRuntime();
    const taskId = this.parseWithSchema(TaskIdSchema, id, 'Invalid task id');
    const replayOptions = this.parseWithSchema(
      ReplayOptionsSchema,
      options,
      'Invalid replay options payload'
    );

    const record = this.taskRecords.get(taskId);
    if (!record) {
      throw createSisyphusAdapterError({
        code: 'TRAJECTORY_NOT_FOUND',
        message: `Replay requires task metadata for: ${taskId}`,
        details: {
          taskId
        }
      });
    }

    if (replayOptions.dryRun) {
      this.pushTaskEvent(taskId, 'trajectory_replay_dry_run', 'Replay dry-run completed', {
        fromEventIndex: replayOptions.fromEventIndex,
        preserveTimestamps: replayOptions.preserveTimestamps
      });
      return;
    }

    this.pushTaskEvent(taskId, 'trajectory_replay_started', `Replay started for task: ${taskId}`);

    try {
      record.status = 'running';

      const replayResult = await runtime.executor.resume(taskId, record.workflow);
      const runState = safeParseLegacyRunState(runtime.store.getRunState(taskId));
      const legacyStatus =
        runState?.status ?? this.legacyStatusFromUnknown(replayResult.status, 'completed');

      record.status = mapLegacyRunStatusToTaskStatus(legacyStatus, {
        cancelled: this.cancelledTaskIds.has(taskId)
      });
      record.completedAt = this.nowIso();

      this.pushTaskEvent(taskId, 'trajectory_replay_completed', `Replay completed for task: ${taskId}`, {
        status: record.status
      });
    } catch (error: unknown) {
      record.status = 'failed';
      record.error = this.errorMessage(error);
      record.completedAt = this.nowIso();

      this.pushTaskEvent(taskId, 'trajectory_replay_failed', `Replay failed for task: ${taskId}`, {
        error: record.error
      });

      throw normalizeSisyphusAdapterError(error, {
        code: 'REPLAY_FAILED',
        message: `Failed to replay trajectory for task: ${taskId}`,
        details: {
          taskId
        }
      });
    }
  }

  private hydrateAgentRecord(agentId: AgentId): AgentRuntimeRecord | null {
    const runtime = this.requireRuntime();
    const runState = safeParseLegacyRunState(runtime.store.getRunState(agentId));

    if (!runState?.name.startsWith(LEGACY_AGENT_WORKFLOW_PREFIX)) {
      return null;
    }

    const fallbackType = runState.name.slice(LEGACY_AGENT_WORKFLOW_PREFIX.length) || 'legacy-agent';
    const config = normalizeAgentConfigFromLegacyInput(runState.input, fallbackType);

    const record: AgentRuntimeRecord = {
      id: agentId,
      config,
      status: mapLegacyRunStatusToAgentStatus(runState.status, {
        cancelled: this.killedAgentIds.has(agentId)
      }),
      startedAt: toIsoDateTime(runState.created_at, this.nowIso()),
      finishedAt:
        runState.status === 'running'
          ? undefined
          : toIsoDateTime(runState.updated_at, this.nowIso())
    };

    this.agentRecords.set(agentId, record);
    return record;
  }

  private parseTask(task: Task): Task {
    try {
      return normalizeTask(task, this.idFactory);
    } catch (error: unknown) {
      throw normalizeSisyphusAdapterError(error, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid task payload'
      });
    }
  }

  private async handleLegacyTaskStep(
    step: Record<string, unknown>,
    context: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const parsedStep = this.parseWithSchema(
      LegacyTaskStepSchema,
      step,
      'Invalid legacy task step payload'
    );

    const record = this.taskRecords.get(parsedStep.taskId);
    if (!record) {
      throw createSisyphusAdapterError({
        code: 'TASK_NOT_FOUND',
        message: `Task record missing for step execution: ${parsedStep.taskId}`,
        details: {
          taskId: parsedStep.taskId
        }
      });
    }

    const output = await this.taskRunner(record.task, context);
    record.output = output;

    return {
      output
    };
  }

  private requireRuntime(): SisyphusRuntime {
    if (!this.runtime) {
      throw createSisyphusAdapterError({
        code: 'UNKNOWN',
        message: 'Sisyphus adapter runtime is not initialized'
      });
    }

    return this.runtime;
  }

  private toPromise<T>(operation: () => T | Promise<T>): Promise<T> {
    return Promise.resolve().then(operation);
  }

  private async loadLegacyModule(): Promise<unknown> {
    if (this.options.loadLegacyModule) {
      return this.options.loadLegacyModule();
    }

    return import(this.getLegacyModulePath());
  }

  private getLegacyModulePath(): string {
    return this.options.modulePath ?? DEFAULT_LEGACY_MODULE_PATH;
  }

  private parseWithSchema<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
    const result = schema.safeParse(value);
    if (result.success) {
      return result.data;
    }

    throw normalizeSisyphusAdapterError(result.error, {
      code: 'VALIDATION_ERROR',
      message
    });
  }

  private nowIso(): string {
    return new Date().toISOString();
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  private pushTaskEvent(
    taskId: string,
    type: string,
    message: string,
    data?: Record<string, unknown>
  ): void {
    const event = createTrajectoryEvent(taskId, type, message, data);
    const existing = this.taskTrajectoryEvents.get(taskId) ?? [];
    existing.push(event);
    this.taskTrajectoryEvents.set(taskId, existing);

    const runtime = this.runtime;
    if (!runtime) {
      return;
    }

    try {
      runtime.store.logEvent(taskId, type, {
        message,
        ...data
      });
    } catch {
      // Trajectory persistence is best effort.
    }
  }

  private toTaskResult(record: TaskRuntimeRecord): TaskResult {
    const metrics = this.createMetrics(record);

    return TaskResultSchema.parse({
      id: record.id,
      status: record.status,
      output: record.output,
      error: record.error,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      metrics
    });
  }

  private createMetrics(record: TaskRuntimeRecord): TaskResult['metrics'] {
    if (!record.completedAt) {
      return undefined;
    }

    const startedAtEpoch = new Date(record.startedAt).getTime();
    const completedAtEpoch = new Date(record.completedAt).getTime();
    const durationMs = Math.max(0, completedAtEpoch - startedAtEpoch);

    return {
      durationMs
    };
  }

  private async runWithOptionalTimeout(
    execution: Promise<LegacyExecutionResult>,
    timeoutMs?: number
  ): Promise<LegacyExecutionResult> {
    if (!timeoutMs) {
      return execution;
    }

    return new Promise<LegacyExecutionResult>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        reject(new TaskTimeoutError(timeoutMs));
      }, timeoutMs);

      execution
        .then((result) => {
          clearTimeout(timeoutHandle);
          resolve(result);
        })
        .catch((error: unknown) => {
          clearTimeout(timeoutHandle);
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  private tryFailLegacyRun(taskId: string): void {
    const runtime = this.runtime;
    if (!runtime) {
      return;
    }

    try {
      runtime.store.updateRunStatus(taskId, 'failed');
    } catch {
      // Best effort failover state update.
    }
  }

  private legacyStatusFromUnknown(
    value: unknown,
    fallback: z.infer<typeof LegacyRunStatusSchema>
  ): z.infer<typeof LegacyRunStatusSchema> {
    const result = LegacyRunStatusSchema.safeParse(value);
    return result.success ? result.data : fallback;
  }
}

export function isSisyphusAdapterError(error: unknown): error is SisyphusAdapterErrorInit {
  return isRecord(error) && typeof error.code === 'string' && typeof error.message === 'string';
}
