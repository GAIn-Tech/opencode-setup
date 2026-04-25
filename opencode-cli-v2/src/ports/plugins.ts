import { z } from 'zod';

/**
 * Plugins port defines plugin discovery, lifecycle, and hook execution contracts.
 */

export const PluginManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1).optional(),
  entrypoint: z.string().min(1),
  hooks: z.array(z.string().min(1)).default([]),
  capabilities: z.array(z.string().min(1)).default([]),
  requiredPermissions: z.array(z.string().min(1)).default([])
});
export type PluginManifest = z.infer<typeof PluginManifestSchema>;

export const PluginStateSchema = z.enum([
  'discovered',
  'installed',
  'loaded',
  'enabled',
  'disabled',
  'error'
]);
export type PluginState = z.infer<typeof PluginStateSchema>;

export const PluginRecordSchema = z.object({
  manifest: PluginManifestSchema,
  state: PluginStateSchema,
  loadedAt: z.string().datetime().optional(),
  lastError: z.string().optional()
});
export type PluginRecord = z.infer<typeof PluginRecordSchema>;

export const PluginInstallRequestSchema = z.object({
  source: z.string().min(1),
  trusted: z.boolean().default(false),
  config: z.record(z.string(), z.unknown()).optional()
});
export type PluginInstallRequest = z.infer<typeof PluginInstallRequestSchema>;

export const HookEventSchema = z.object({
  name: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  context: z.record(z.string(), z.unknown()).optional()
});
export type HookEvent = z.infer<typeof HookEventSchema>;

export const HookResultSchema = z.object({
  pluginId: z.string().min(1),
  handled: z.boolean(),
  output: z.unknown().optional(),
  error: z.string().optional(),
  durationMs: z.number().nonnegative().optional()
});
export type HookResult = z.infer<typeof HookResultSchema>;

export const PluginHealthSchema = z.object({
  pluginId: z.string().min(1),
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  details: z.string().optional(),
  checkedAt: z.string().datetime()
});
export type PluginHealth = z.infer<typeof PluginHealthSchema>;

export const PluginErrorCodeSchema = z.enum([
  'PLUGIN_NOT_FOUND',
  'PLUGIN_INSTALL_FAILED',
  'PLUGIN_LOAD_FAILED',
  'PLUGIN_ENABLE_FAILED',
  'PLUGIN_HOOK_FAILED',
  'VALIDATION_ERROR',
  'UNKNOWN'
]);
export type PluginErrorCode = z.infer<typeof PluginErrorCodeSchema>;

export const PluginsPortErrorSchema = z.object({
  code: PluginErrorCodeSchema,
  message: z.string().min(1),
  retriable: z.boolean().default(false),
  details: z.record(z.string(), z.unknown()).optional()
});
export type PluginsPortError = z.infer<typeof PluginsPortErrorSchema>;

export interface PluginsPort {
  /** Lists all plugin records currently known to the runtime. */
  listPlugins(): Promise<PluginRecord[]>;
  /** Installs a plugin from configured source. */
  installPlugin(request: PluginInstallRequest): Promise<PluginManifest>;
  /** Uninstalls an installed plugin by identifier. */
  uninstallPlugin(pluginId: string): Promise<void>;
  /** Loads plugin runtime resources and entrypoint code. */
  loadPlugin(pluginId: string): Promise<void>;
  /** Unloads plugin runtime resources and entrypoint code. */
  unloadPlugin(pluginId: string): Promise<void>;
  /** Enables a loaded plugin. */
  enablePlugin(pluginId: string): Promise<void>;
  /** Disables an enabled plugin. */
  disablePlugin(pluginId: string): Promise<void>;
  /** Dispatches a hook event to eligible plugins. */
  runHook(event: HookEvent): Promise<HookResult[]>;
  /** Returns health information for a plugin. */
  getPluginHealth(pluginId: string): Promise<PluginHealth>;
}
