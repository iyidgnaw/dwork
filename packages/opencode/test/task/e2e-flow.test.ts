import { describe, expect, test } from "bun:test"
import path from "path"
import { Bus } from "../../src/bus"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { MessageV2 } from "../../src/session/message-v2"
import { Audit, Task } from "../../src/task"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

const id = (tag: string) => `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const fileFrom = (event: Audit.Info) => {
  if (event.type !== "file_change") return
  const payload = event.payload as Record<string, unknown>
  const input = payload.input
  if (typeof input !== "object" || !input) return
  const filePath = (input as Record<string, unknown>).filePath
  if (typeof filePath !== "string") return
  return filePath
}

const testCommand = (event: Audit.Info) => {
  if (event.type !== "test") return
  const payload = event.payload as Record<string, unknown>
  const input = payload.input
  if (typeof input !== "object" || !input) return
  const command = (input as Record<string, unknown>).command
  if (typeof command !== "string") return
  return command
}

const buildSummary = (tasks: Task.Info[], events: Audit.Info[]) => {
  const completed = tasks.filter((item) => item.status === "done")
  const pending = tasks.filter((item) => item.status !== "done")
  const files = [...new Set(events.map(fileFrom).filter((item) => !!item))].sort()
  const tests = events.map(testCommand).filter((item) => !!item)
  return [
    "## Delivery Summary",
    "",
    "### Completed Tasks",
    ...completed.map((item) => `- [${item.id}] ${item.title}`),
    "",
    "### Changes",
    ...(files.length ? files.map((item) => `- ${item}`) : ["- none"]),
    "",
    "### Test Results",
    ...(tests.length ? tests.map((item) => `- ${item}`) : ["- none"]),
    "",
    "### Next Steps",
    ...(pending.length ? pending.map((item) => `- [${item.id}] ${item.title} (${item.status})`) : ["- none"]),
  ].join("\n")
}

describe("task e2e flow", () => {
  test("covers spec to task to execution to summary", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(path.join(dir, "requirements.md"), "# requirement\n\nShip task board")
        await Bun.write(path.join(dir, "design.md"), "# design\n\nUse task + audit timeline")
        await Bun.write(path.join(dir, "task.md"), "# task\n\n- T03\n- T05\n- T06\n- T07")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        Audit.init()
        const session = await Session.create({})
        const task = await Task.create({
          id: id("t03"),
          title: "Implement Task Board dock",
          description: "Build list, filter, details and status transitions",
          assignee: "cursor-agent",
          status: "todo",
          dependencies: [],
          acceptance_criteria: ["Create/edit/view task", "Filter by assignee/status", "Status transition valid"],
          context_refs: ["requirements.md", "design.md", "task.md"],
          session_id: session.id,
        })

        await Task.set_status({ id: task.id, status: "doing" })

        const filePart: MessageV2.ToolPart = {
          id: id("part"),
          sessionID: session.id,
          messageID: id("msg"),
          type: "tool",
          callID: id("call"),
          tool: "write",
          state: {
            status: "completed",
            input: { filePath: path.join(tmp.path, "src", "task-board.tsx") },
            output: "Wrote file successfully.",
            title: "task-board.tsx",
            metadata: {},
            time: { start: Date.now() - 10, end: Date.now() },
          },
        }
        const testPart: MessageV2.ToolPart = {
          id: id("part"),
          sessionID: session.id,
          messageID: id("msg"),
          type: "tool",
          callID: id("call"),
          tool: "bash",
          state: {
            status: "completed",
            input: { command: "bun test packages/opencode/test/task/task.test.ts" },
            output: "ok",
            title: "Run task tests",
            metadata: { exit: 0 },
            time: { start: Date.now() - 10, end: Date.now() },
          },
        }
        const commitPart: MessageV2.ToolPart = {
          id: id("part"),
          sessionID: session.id,
          messageID: id("msg"),
          type: "tool",
          callID: id("call"),
          tool: "bash",
          state: {
            status: "completed",
            input: { command: 'git commit -m "feat(app): task board dock"' },
            output: "[branch] feat(app): task board dock",
            title: "Commit task work",
            metadata: { exit: 0 },
            time: { start: Date.now() - 10, end: Date.now() },
          },
        }

        await Bus.publish(MessageV2.Event.PartUpdated, { part: filePart })
        await Bus.publish(MessageV2.Event.PartUpdated, { part: testPart })
        await Bus.publish(MessageV2.Event.PartUpdated, { part: commitPart })
        await Task.set_status({ id: task.id, status: "done" })

        await Task.create({
          id: id("t07"),
          title: "Run e2e acceptance and backlog review",
          description: "Validate full flow and list follow-up issues",
          assignee: "cursor-agent",
          status: "todo",
          dependencies: [task.id],
          acceptance_criteria: ["One complete flow validated"],
          context_refs: ["task.md"],
          session_id: session.id,
        })

        const tasks = await Task.list({ session_id: session.id })
        const events = await Audit.list({ session_id: session.id })

        expect(tasks.some((item) => item.id === task.id && item.status === "done")).toBe(true)
        expect(events.map((item) => item.type)).toContain("file_change")
        expect(events.map((item) => item.type)).toContain("test")
        expect(events.map((item) => item.type)).toContain("commit")
        expect(events.every((item) => item.task_id === task.id)).toBe(true)

        const summary = buildSummary(tasks, events)
        expect(summary).toContain("## Delivery Summary")
        expect(summary).toContain("Implement Task Board dock")
        expect(summary).toContain("task-board.tsx")
        expect(summary).toContain("bun test packages/opencode/test/task/task.test.ts")
        expect(summary).toContain("Run e2e acceptance and backlog review")
      },
    })
  })
})
