import type { OhMyOpenCodeConfig } from "./config"
import type { ModelCacheState } from "./plugin-state"
import type { PluginContext, TmuxConfig } from "./plugin/types"

import type { SubagentSessionCreatedEvent } from "./features/background-agent"
import { BackgroundManager } from "./features/background-agent"
import { SkillMcpManager } from "./features/skill-mcp-manager"
import { initTaskToastManager } from "./features/task-toast-manager"
import { TmuxSessionManager } from "./features/tmux-subagent"
import * as openclawRuntimeDispatch from "./openclaw/runtime-dispatch"
import { registerManagerForCleanup } from "./features/background-agent/process-cleanup"
import { createConfigHandler } from "./plugin-handlers"
import { log } from "./shared"
import { markServerRunningInProcess } from "./shared/tmux/tmux-utils/server-health"

// SkillRLManager for production learning (gap-audit integration)
let SkillRLManager: any = null
try {
  SkillRLManager = require('opencode-skill-rl-manager').SkillRLManager
} catch (e) {
  // Not available - will be null
}

type CreateManagersDeps = {
  BackgroundManagerClass: typeof BackgroundManager
  SkillMcpManagerClass: typeof SkillMcpManager
  TmuxSessionManagerClass: typeof TmuxSessionManager
  initTaskToastManagerFn: typeof initTaskToastManager
  registerManagerForCleanupFn: typeof registerManagerForCleanup
  createConfigHandlerFn: typeof createConfigHandler
  markServerRunningInProcessFn: typeof markServerRunningInProcess
}

const defaultCreateManagersDeps: CreateManagersDeps = {
  BackgroundManagerClass: BackgroundManager,
  SkillMcpManagerClass: SkillMcpManager,
  TmuxSessionManagerClass: TmuxSessionManager,
  initTaskToastManagerFn: initTaskToastManager,
  registerManagerForCleanupFn: registerManagerForCleanup,
  createConfigHandlerFn: createConfigHandler,
  markServerRunningInProcessFn: markServerRunningInProcess,
}

export type Managers = {
  tmuxSessionManager: TmuxSessionManager
  backgroundManager: BackgroundManager
  skillMcpManager: SkillMcpManager
  configHandler: ReturnType<typeof createConfigHandler>
  skillRLManager: InstanceType<typeof SkillRLManager> | null
}

export function createManagers(args: {
  ctx: PluginContext
  pluginConfig: OhMyOpenCodeConfig
  tmuxConfig: TmuxConfig
  modelCacheState: ModelCacheState
  backgroundNotificationHookEnabled: boolean
  deps?: Partial<CreateManagersDeps>
}): Managers {
  const { ctx, pluginConfig, tmuxConfig, modelCacheState, backgroundNotificationHookEnabled } = args
  const deps = { ...defaultCreateManagersDeps, ...args.deps }

  if (tmuxConfig.enabled) {
    deps.markServerRunningInProcessFn()
  }
  const tmuxSessionManager = new deps.TmuxSessionManagerClass(ctx, tmuxConfig)

  deps.registerManagerForCleanupFn({
    shutdown: async () => {
      await tmuxSessionManager.cleanup().catch((error) => {
        log("[create-managers] tmux cleanup error during process shutdown:", error)
      })
    },
  })

  const backgroundManager = new deps.BackgroundManagerClass(
    ctx,
    pluginConfig.background_task,
    {
      tmuxConfig,
		onSubagentSessionCreated: async (event: SubagentSessionCreatedEvent) => {
			log("[index] onSubagentSessionCreated callback received", {
				sessionID: event.sessionID,
				parentID: event.parentID,
          title: event.title,
        })

        await tmuxSessionManager.onSessionCreated({
          type: "session.created",
          properties: {
            info: {
              id: event.sessionID,
              parentID: event.parentID,
              title: event.title,
            },
          },
        })

        if (pluginConfig.openclaw) {
        await openclawRuntimeDispatch.dispatchOpenClawEvent({
            config: pluginConfig.openclaw,
            rawEvent: "session.created",
            context: {
              sessionId: event.sessionID,
              projectPath: ctx.directory,
              tmuxPaneId: tmuxSessionManager.getTrackedPaneId?.(event.sessionID) ?? process.env.TMUX_PANE,
            },
          })
        }

        log("[index] onSubagentSessionCreated callback completed")
      },
      onShutdown: async () => {
        await tmuxSessionManager.cleanup().catch((error) => {
          log("[index] tmux cleanup error during shutdown:", error)
        })
      },
      enableParentSessionNotifications: backgroundNotificationHookEnabled,
    },
  )

  deps.initTaskToastManagerFn(ctx.client)

  const skillMcpManager = new deps.SkillMcpManagerClass()

  const configHandler = deps.createConfigHandlerFn({
    ctx: { directory: ctx.directory, client: ctx.client },
    pluginConfig,
    modelCacheState,
  })

  // SkillRLManager instantiation (gap-audit: production learning)
  let skillRLManager: InstanceType<typeof SkillRLManager> | null = null
  if (SkillRLManager) {
    try {
      skillRLManager = new SkillRLManager({
        stateFile: '.opencode/skill-rl.json'
      })
      log("[create-managers] SkillRLManager initialized for production learning")
    } catch (e) {
      log("[create-managers] SkillRLManager init error:", e)
    }
  }

  return {
    tmuxSessionManager,
    backgroundManager,
    skillMcpManager,
    configHandler,
    skillRLManager,
  }
}
