import { z } from 'zod';

import {
  AgentConfigSchema,
  AgentInfoSchema,
  TaskSchema,
  TaskStatusSchema,
  TrajectoryEventSchema,
  type AgentConfig,
  type AgentInfo,
  type AgentStatus,
  type Task,
  type TaskStatus,
  type TrajectoryEvent
} from '../../ports/orchestration';

/**
 * Mapping decisions between the v2 orchestration contract and legacy Sisyphus runtime:
 *
 * 1) Legacy run statuses are `running|completed|failed` and map directly to v2 core states.
 * 2) `cancelled` and `timed_out` do not exist in the legacy store and are tracked by adapter metadata.
 * 3) Agent records are represented as legacy workflow runs with the `agent:` name prefix.
 * 4) Trajectory events are normalized into v2 `TrajectoryEvent` records with ISO timestamps.
 */
export const LEGACY_AGENT_WORKFLOW_PREFIX = 'agent:';
export const LEGACY_TASK_STEP_TYPE = 'opencode-cli-v2:task';

export const LegacyRunStatusSchema = z.enum(['running', 'completed', 'failed']);
export type LegacyRunStatus = z.infer<typeof LegacyRunStatusSchema>;

const legacyRecordSchema = z.record(z.string(), z.unknown());

const nullableRecordSchema = z
  .union([legacyRecordSchema, z.null(), z.undefined()])
  .transform((value) => value ?? {});

export const LegacyRunStateSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).default(''),
    status: LegacyRunStatusSchema,
    input: nullableRecordSchema,
    context: nullableRecordSchema,
    created_at: z.string().optional(),
    updated_at: z.string().optional()
  })
  .passthrough();
export type LegacyRunState = z.infer<typeof LegacyRunStateSchema>;

export interface LegacyWorkflowStep extends Record<string, unknown> {
  readonly id: string;
  readonly type: string;
}

export interface LegacyWorkflowDefinition {
  readonly id?: string;
  readonly name: string;
  readonly steps: readonly LegacyWorkflowStep[];
}

export interface LegacyExecutionResult {
  readonly runId: string;
  readonly status: string;
  readonly context?: Record<string, unknown>;
}

export interface LegacyWorkflowStore {
  createRun(name: string, input: Record<string, unknown>, id?: string | null): string;
  getRunState(id: string): unknown;
  updateRunStatus(id: string, status: LegacyRunStatus): void;
  logEvent(runId: string, type: string, payload: Record<string, unknown>): void;
  close?(): Promise<void> | void;
}

export type LegacyStepHandler = (
  step: Record<string, unknown>,
  context: Record<string, unknown>
) => Promise<Record<string, unknown>> | Record<string, unknown>;

export interface LegacyWorkflowExecutor {
  execute(
    workflowDef: LegacyWorkflowDefinition,
    input: Record<string, unknown>,
    runId?: string | null
  ): Promise<LegacyExecutionResult>;
  resume(runId: string, workflowDef: LegacyWorkflowDefinition): Promise<LegacyExecutionResult>;
}

export type LegacyWorkflowStoreConstructor = new (dbPath?: string) => LegacyWorkflowStore;

export type LegacyWorkflowExecutorConstructor = new (
  store: LegacyWorkflowStore,
  handlers?: Record<string, LegacyStepHandler>,
  options?: Record<string, unknown>
) => LegacyWorkflowExecutor;

export interface LegacySisyphusModule {
  readonly WorkflowStore: LegacyWorkflowStoreConstructor;
  readonly WorkflowExecutor: LegacyWorkflowExecutorConstructor;
}

export interface AgentSnapshot {
  readonly id: string;
  readonly status: AgentStatus;
  readonly config: AgentConfig;
  readonly startedAt: string;
  readonly finishedAt?: string;
}

const LegacySisyphusModuleSchema = z.object({
  WorkflowStore: z.custom<LegacyWorkflowStoreConstructor>((value) => typeof value === 'function'),
  WorkflowExecutor: z.custom<LegacyWorkflowExecutorConstructor>((value) => typeof value === 'function')
});

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseLegacySisyphusModule(moduleValue: unknown): LegacySisyphusModule {
  const namespace = isRecord(moduleValue) ? moduleValue : {};
  const candidate = isRecord(namespace.default) ? namespace.default : namespace;
  return LegacySisyphusModuleSchema.parse(candidate);
}

export function safeParseLegacyRunState(value: unknown): LegacyRunState | null {
  const result = LegacyRunStateSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function mapLegacyRunStatusToAgentStatus(
  status: LegacyRunStatus,
  options: {
    readonly cancelled?: boolean;
  } = {}
): AgentStatus {
  if (options.cancelled) {
    return 'cancelled';
  }

  if (status === 'completed') {
    return 'completed';
  }

  if (status === 'failed') {
    return 'failed';
  }

  return 'running';
}

export function mapLegacyRunStatusToTaskStatus(
  status: LegacyRunStatus,
  options: {
    readonly cancelled?: boolean;
    readonly timedOut?: boolean;
  } = {}
): TaskStatus {
  if (options.cancelled) {
    return 'cancelled';
  }

  if (options.timedOut) {
    return 'timed_out';
  }

  if (status === 'completed') {
    return 'completed';
  }

  if (status === 'failed') {
    return 'failed';
  }

  return 'running';
}

export function toIsoDateTime(value: unknown, fallback = new Date().toISOString()): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed.toISOString();
}

export function createLegacyTaskWorkflow(task: Task): LegacyWorkflowDefinition {
  return {
    id: task.id,
    name: `task:${task.type}`,
    steps: [
      {
        id: 'execute-task',
        type: LEGACY_TASK_STEP_TYPE,
        taskId: task.id
      }
    ]
  };
}

export function normalizeTask(task: Task, idFactory: () => string): Task {
  const taskId = task.id ?? idFactory();
  return TaskSchema.parse({
    ...task,
    id: taskId
  });
}

export function createTrajectoryEvent(
  taskId: string,
  type: string,
  message: string,
  data?: Record<string, unknown>
): TrajectoryEvent {
  return TrajectoryEventSchema.parse({
    at: new Date().toISOString(),
    type,
    message,
    data: {
      taskId,
      ...data
    }
  });
}

export function snapshotToAgentInfo(snapshot: AgentSnapshot): AgentInfo {
  return AgentInfoSchema.parse({
    id: snapshot.id,
    status: snapshot.status,
    config: snapshot.config,
    startedAt: snapshot.startedAt,
    finishedAt: snapshot.finishedAt
  });
}

export function normalizeAgentConfigFromLegacyInput(
  input: Record<string, unknown>,
  fallbackType: string
): AgentConfig {
  const directCandidate = input.agentConfig;
  if (isRecord(directCandidate)) {
    const parsed = AgentConfigSchema.safeParse(directCandidate);
    if (parsed.success) {
      return parsed.data;
    }
  }

  const skills = Array.isArray(input.skills)
    ? input.skills.filter((skill): skill is string => typeof skill === 'string' && skill.length > 0)
    : undefined;

  return AgentConfigSchema.parse({
    type: fallbackType || 'legacy-agent',
    task: typeof input.task === 'string' && input.task.length > 0 ? input.task : 'legacy-agent-task',
    model: typeof input.model === 'string' ? input.model : undefined,
    skills,
    metadata: input
  });
}

export function normalizeTaskStatus(status: TaskStatus): TaskStatus {
  return TaskStatusSchema.parse(status);
}
