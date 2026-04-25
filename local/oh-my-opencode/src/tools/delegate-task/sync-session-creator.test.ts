import { describe, expect, test } from "bun:test"

import { createSyncSession } from "./sync-session-creator"

describe("createSyncSession", () => {
  test("creates child session with question permission denied", async () => {
    // given
    const createCalls: Array<Record<string, unknown>> = []
    const client = {
      session: {
        get: async () => ({ data: { directory: "/parent" } }),
        create: async (input: Record<string, unknown>) => {
          createCalls.push(input)
          return { data: { id: "ses_child" } }
        },
      },
    }

    // when
    const result = await createSyncSession(client as never, {
      parentSessionID: "ses_parent",
      agentToUse: "explore",
      description: "test task",
      defaultDirectory: "/fallback",
    })

    // then
    expect(result).toEqual({ ok: true, sessionID: "ses_child", parentDirectory: "/parent" })
    expect(createCalls).toHaveLength(1)
    expect(createCalls[0]?.body).toEqual({
      parentID: "ses_parent",
      title: "test task (@explore subagent)",
      permission: [
        { permission: "question", action: "deny", pattern: "*" },
      ],
    })
  })

  test("uses a Windows-safe directory when parent session directory is under AppData", async () => {
    // given
    const createCalls: Array<Record<string, unknown>> = []
    const appDataDirectory = "C:/Users/test/AppData/Local/ai.opencode.desktop"
    const expectedDirectory = process.platform === "win32" ? process.cwd() : appDataDirectory

    const client = {
      session: {
        get: async () => ({ data: { directory: appDataDirectory } }),
        create: async (input: Record<string, unknown>) => {
          createCalls.push(input)
          return { data: { id: "ses_child" } }
        },
      },
    }

    // when
    const result = await createSyncSession(client as never, {
      parentSessionID: "ses_parent",
      agentToUse: "explore",
      description: "test task",
      defaultDirectory: appDataDirectory,
    })

    // then
    expect(result).toEqual({ ok: true, sessionID: "ses_child", parentDirectory: expectedDirectory })
    expect(createCalls).toHaveLength(1)
    expect(createCalls[0]?.query).toEqual({ directory: expectedDirectory })
  })
})
