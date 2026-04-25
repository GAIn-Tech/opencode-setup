import { z } from 'zod';

export const PtyHookNameSchema = z.enum(['pty.spawn', 'pty.write', 'pty.read', 'pty.resize', 'pty.kill']);
export type PtyHookName = z.infer<typeof PtyHookNameSchema>;

export const PtySessionStatusSchema = z.enum(['running', 'exited']);
export type PtySessionStatus = z.infer<typeof PtySessionStatusSchema>;

export const PtySpawnPayloadSchema = z
  .object({
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    cwd: z.string().min(1).optional(),
    env: z.record(z.string(), z.string()).optional(),
    cols: z.number().int().positive().default(80),
    rows: z.number().int().positive().default(24)
  })
  .passthrough();
export type PtySpawnPayload = z.infer<typeof PtySpawnPayloadSchema>;

export const PtyWritePayloadSchema = z
  .object({
    sessionId: z.string().min(1),
    data: z.string()
  })
  .passthrough();
export type PtyWritePayload = z.infer<typeof PtyWritePayloadSchema>;

export const PtyReadPayloadSchema = z
  .object({
    sessionId: z.string().min(1),
    maxBytes: z.number().int().positive().optional()
  })
  .passthrough();
export type PtyReadPayload = z.infer<typeof PtyReadPayloadSchema>;

export const PtyResizePayloadSchema = z
  .object({
    sessionId: z.string().min(1),
    cols: z.number().int().positive(),
    rows: z.number().int().positive()
  })
  .passthrough();
export type PtyResizePayload = z.infer<typeof PtyResizePayloadSchema>;

export const PtyKillPayloadSchema = z
  .object({
    sessionId: z.string().min(1),
    signal: z.string().min(1).default('SIGTERM')
  })
  .passthrough();
export type PtyKillPayload = z.infer<typeof PtyKillPayloadSchema>;

export const PtySpawnResultSchema = z.object({
  sessionId: z.string().min(1),
  pid: z.number().int().positive(),
  command: z.string().min(1),
  args: z.array(z.string()),
  cwd: z.string().optional(),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
  status: PtySessionStatusSchema
});
export type PtySpawnResult = z.infer<typeof PtySpawnResultSchema>;

export const PtyWriteResultSchema = z.object({
  sessionId: z.string().min(1),
  status: PtySessionStatusSchema,
  bytesWritten: z.number().int().nonnegative()
});
export type PtyWriteResult = z.infer<typeof PtyWriteResultSchema>;

export const PtyReadResultSchema = z.object({
  sessionId: z.string().min(1),
  status: PtySessionStatusSchema,
  data: z.string(),
  eof: z.boolean()
});
export type PtyReadResult = z.infer<typeof PtyReadResultSchema>;

export const PtyResizeResultSchema = z.object({
  sessionId: z.string().min(1),
  status: PtySessionStatusSchema,
  cols: z.number().int().positive(),
  rows: z.number().int().positive()
});
export type PtyResizeResult = z.infer<typeof PtyResizeResultSchema>;

export const PtyKillResultSchema = z.object({
  sessionId: z.string().min(1),
  status: PtySessionStatusSchema,
  exitCode: z.number().int().nonnegative(),
  signal: z.string().min(1)
});
export type PtyKillResult = z.infer<typeof PtyKillResultSchema>;

export function resolvePtyHookName(name: string): PtyHookName | undefined {
  const parsed = PtyHookNameSchema.safeParse(name);
  return parsed.success ? parsed.data : undefined;
}
