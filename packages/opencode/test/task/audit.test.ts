import { describe, expect, test } from "bun:test"
import { Bus } from "../../src/bus"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { MessageV2 } from "../../src/session/message-v2"
import { Audit, Task } from "../../src/task"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

const id = (tag: string) => `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

describe("audit events", () => {
  test("records test execution and links to task_id", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        Audit.init()
        const session = await Session.create({})
        const task = await Task.create({
          id: id("task"),
          title: "Run tests",
          description: "Task with bound session",
          assignee: "cursor-agent",
          status: "doing",
          dependencies: [],
          acceptance_criteria: [],
          context_refs: [],
          session_id: session.id,
        })
        const part: MessageV2.ToolPart = {
          id: id("part"),
          sessionID: session.id,
          messageID: id("msg"),
          type: "tool",
          callID: id("call"),
          tool: "bash",
          state: {
            status: "completed",
            input: { command: "bun test --timeout 30000" },
            output: "ok",
            title: "Run tests",
            metadata: { exit: 0 },
            time: {
              start: Date.now() - 10,
              end: Date.now(),
            },
          },
        }
        await Bus.publish(MessageV2.Event.PartUpdated, { part })

        const bySession = await Audit.list({ session_id: session.id })
        expect(bySession.length).toBe(1)
        expect(bySession[0].type).toBe("test")
        expect(bySession[0].task_id).toBe(task.id)

        const byTask = await Audit.list({ task_id: task.id })
        expect(byTask.length).toBe(1)
        expect(byTask[0].session_id).toBe(session.id)
      },
    })
  })

  test("deduplicates repeated tool updates by source_part_id", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        Audit.init()
        const session = await Session.create({})
        const part: MessageV2.ToolPart = {
          id: id("part"),
          sessionID: session.id,
          messageID: id("msg"),
          type: "tool",
          callID: id("call"),
          tool: "write",
          state: {
            status: "completed",
            input: { filePath: `${tmp.path}/a.ts` },
            output: "Wrote file successfully.",
            title: "a.ts",
            metadata: {},
            time: {
              start: Date.now() - 10,
              end: Date.now(),
            },
          },
        }
        await Bus.publish(MessageV2.Event.PartUpdated, { part })
        await Bus.publish(MessageV2.Event.PartUpdated, { part })

        const items = await Audit.list({ session_id: session.id })
        expect(items.length).toBe(1)
        expect(items[0].type).toBe("file_change")
        const payload = items[0].payload as Record<string, unknown>
        const changed = payload.changed_files
        expect(Array.isArray(changed)).toBe(true)
        expect(changed).toContain(`${tmp.path}/a.ts`)
      },
    })
  })
})
