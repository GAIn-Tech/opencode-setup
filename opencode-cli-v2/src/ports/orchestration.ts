import { z } from 'zod';

/**
 * Orchestration port defines the contract for agent and task execution runtimes.
 */

export const AgentIdSchema = z.string().min(1);
export type AgentId = z.infer<typeof AgentIdSchema>;

export const TaskIdSchema = z.string().min(1);
export type TaskId = z.infer<typeof TaskIdSchema>;

export const AgentStatusSchema = z.enum([
  'pending',
  'starting',
  'running',
  'completed',
  'failed',
  'cancelled'
]);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const TaskStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
  'timed_out'
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const AgentConfigSchema = z.object({
  type: z.string().min(1),
  task: z.string().min(1),
  model: z.string().min(1).optional(),
  skills: z.array(z.string().min(1)).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  timeoutMs: z.number().int().positive().optional()
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export const AgentInfoSchema = z.object({
  id: AgentIdSchema,
  status: AgentStatusSchema,
  config: AgentConfigSchema,
  startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime().optional()
});
export type AgentInfo = z.infer<typeof AgentInfoSchema>;

export const TaskSchema = z.object({
  id: TaskIdSchema.optional(),
  type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
  correlationId: z.string().min(1).optional(),
  timeoutMs: z.number().int().positive().optional()
});
export type Task = z.infer<typeof TaskSchema>;

export const TaskResultSchema = z.object({
  id: TaskIdSchema,
  status: TaskStatusSchema,
  output: z.unknown().optional(),
  error: z.string().optional(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  metrics: z
    .object({
      durationMs: z.number().nonnegative().optional(),
      tokensIn: z.number().int().nonnegative().optional(),
      tokensOut: z.number().int().nonnegative().optional()
    })
    .optional()
});
export type TaskResult = z.infer<typeof TaskResultSchema>;

export const TrajectoryEventSchema = z.object({
  at: z.string().datetime(),
  type: z.string().min(1),
  message: z.string().min(1),
  data: z.record(z.string(), z.unknown()).optional()
});
export type TrajectoryEvent = z.infer<typeof TrajectoryEventSchema>;

export const TrajectorySchema = z.object({
  taskId: TaskIdSchema,
  events: z.array(TrajectoryEventSchema),
  summary: z.string().optional()
});
export type Trajectory = z.infer<typeof TrajectorySchema>;

export const ReplayOptionsSchema = z.object({
  fromEventIndex: z.number().int().nonnegative().optional(),
  dryRun: z.boolean().default(true),
  preserveTimestamps: z.boolean().default(false)
});
export type ReplayOptions = z.infer<typeof ReplayOptionsSchema>;

export const OrchestrationErrorCodeSchema = z.enum([
  'AGENT_SPAWN_FAILED',
  'AGENT_NOT_FOUND',
  'TASK_EXECUTION_FAILED',
  'TASK_NOT_FOUND',
  'TRAJECTORY_NOT_FOUND',
  'REPLAY_FAILED',
  'VALIDATION_ERROR',
  'UNKNOWN'
]);
export type OrchestrationErrorCode = z.infer<typeof OrchestrationErrorCodeSchema>;

export const OrchestrationPortErrorSchema = z.object({
  code: OrchestrationErrorCodeSchema,
  message: z.string().min(1),
  retriable: z.boolean().default(false),
  details: z.record(z.string(), z.unknown()).optional()
});
export type OrchestrationPortError = z.infer<typeof OrchestrationPortErrorSchema>;

export interface OrchestrationPort {
  /** Agent lifecycle */
  spawnAgent(config: AgentConfig): Promise<AgentId>;
  killAgent(id: AgentId): Promise<void>;
  getAgentStatus(id: AgentId): Promise<AgentStatus>;
  listAgents(): Promise<AgentInfo[]>;

  /** Task execution */
  executeTask(task: Task): Promise<TaskResult>;
  cancelTask(id: TaskId): Promise<void>;
  getTaskStatus(id: TaskId): Promise<TaskStatus>;

  /** Trajectory operations */
  getTrajectory(id: TaskId): Promise<Trajectory>;
  replayTrajectory(id: TaskId, options: ReplayOptions): Promise<void>;
}
