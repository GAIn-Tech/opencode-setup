import { describe, expect, test } from "bun:test"

import { createOrGetSession } from "./session-creator"
import { _resetForTesting, subagentSessions } from "../../features/claude-code-session-state"

describe("call-omo-agent createOrGetSession", () => {
  test("creates child session without overriding permission and tracks it as subagent session", async () => {
    // given
    _resetForTesting()

    const createCalls: Array<unknown> = []
    const ctx = {
      directory: "/project",
      client: {
        session: {
          get: async () => ({ data: { directory: "/parent" } }),
          create: async (args: unknown) => {
            createCalls.push(args)
            return { data: { id: "ses_child" } }
          },
        },
      },
    }

    const toolContext = {
      sessionID: "ses_parent",
      messageID: "msg_parent",
      agent: "sisyphus",
      abort: new AbortController().signal,
    }

    const args = {
      description: "test",
      prompt: "hello",
      subagent_type: "explore",
      run_in_background: true,
    }

    // when
    const result = await createOrGetSession(args as any, toolContext as any, ctx as any)

    // then
    expect(result).toEqual({ sessionID: "ses_child", isNew: true })
    expect(createCalls).toHaveLength(1)
    const createBody = (createCalls[0] as any)?.body
    expect(createBody?.parentID).toBe("ses_parent")
    expect(createBody?.permission).toBeUndefined()
    expect(subagentSessions.has("ses_child")).toBe(true)
  })

  test("uses Windows-safe directory when parent session directory is under AppData", async () => {
    // given
    _resetForTesting()

    const createCalls: Array<unknown> = []
    const appDataDirectory = "C:/Users/test/AppData/Local/ai.opencode.desktop"
    const expectedDirectory = process.platform === "win32" ? process.cwd() : appDataDirectory

    const ctx = {
      directory: appDataDirectory,
      client: {
        session: {
          get: async () => ({ data: { directory: appDataDirectory } }),
          create: async (args: unknown) => {
            createCalls.push(args)
            return { data: { id: "ses_child" } }
          },
        },
      },
    }

    const toolContext = {
      sessionID: "ses_parent",
      messageID: "msg_parent",
      agent: "sisyphus",
      abort: new AbortController().signal,
    }

    const args = {
      description: "test",
      prompt: "hello",
      subagent_type: "explore",
      run_in_background: true,
    }

    // when
    await createOrGetSession(args as any, toolContext as any, ctx as any)

    // then
    expect(createCalls).toHaveLength(1)
    const createQuery = (createCalls[0] as any)?.query
    expect(createQuery).toEqual({ directory: expectedDirectory })
  })
})
