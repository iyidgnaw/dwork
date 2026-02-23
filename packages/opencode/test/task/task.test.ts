import { describe, expect, test } from "bun:test"
import { Instance } from "../../src/project/instance"
import { Task } from "../../src/task"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

const id = (tag: string) => `task-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

describe("task model", () => {
  test("creates task with required fields", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const task = await Task.create({
          id: id("create"),
          title: "Define task model",
          description: "Implement task fields and storage",
          assignee: "cursor-agent",
          status: "todo",
          dependencies: [],
          acceptance_criteria: ["fields are persisted"],
          context_refs: ["requirements.md"],
        })

        expect(task.status).toBe("todo")
        expect(task.assignee).toBe("cursor-agent")
        expect(task.acceptance_criteria).toEqual(["fields are persisted"])
        expect(task.context_refs).toEqual(["requirements.md"])

        const loaded = await Task.get(task.id)
        expect(loaded.id).toBe(task.id)
        expect(loaded.description).toBe("Implement task fields and storage")
      },
    })
  })

  test("allows only declared status transitions", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const task = await Task.create({
          id: id("flow"),
          title: "Run task workflow",
          description: "Verify task transitions",
          assignee: "cursor-agent",
          status: "todo",
          dependencies: [],
          acceptance_criteria: [],
          context_refs: [],
        })

        const doing = await Task.set_status({ id: task.id, status: "doing" })
        expect(doing.status).toBe("doing")

        const blocked = await Task.set_status({ id: task.id, status: "blocked" })
        expect(blocked.status).toBe("blocked")

        const resumed = await Task.set_status({ id: task.id, status: "doing" })
        expect(resumed.status).toBe("doing")

        const done = await Task.set_status({ id: task.id, status: "done" })
        expect(done.status).toBe("done")
      },
    })
  })

  test("rejects invalid transition and keeps previous status", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const task = await Task.create({
          id: id("invalid"),
          title: "Reject invalid transition",
          description: "todo cannot jump directly to done",
          assignee: "cursor-agent",
          status: "todo",
          dependencies: [],
          acceptance_criteria: [],
          context_refs: [],
        })

        await expect(Task.set_status({ id: task.id, status: "done" })).rejects.toThrow(
          "Invalid task status transition",
        )

        const latest = await Task.get(task.id)
        expect(latest.status).toBe("todo")
      },
    })
  })

  test("filters list by assignee and status", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const a = await Task.create({
          id: id("cursor"),
          title: "Cursor task",
          description: "Task owned by cursor",
          assignee: "cursor-agent",
          status: "todo",
          dependencies: [],
          acceptance_criteria: [],
          context_refs: [],
        })
        const b = await Task.create({
          id: id("codex"),
          title: "Codex task",
          description: "Task owned by codex",
          assignee: "codex-agent",
          status: "todo",
          dependencies: [],
          acceptance_criteria: [],
          context_refs: [],
        })
        await Task.set_status({ id: a.id, status: "doing" })

        const byAssignee = await Task.list({ assignee: "cursor-agent" })
        expect(byAssignee.map((item) => item.id)).toContain(a.id)
        expect(byAssignee.map((item) => item.id)).not.toContain(b.id)
        expect(byAssignee.every((item) => item.assignee === "cursor-agent")).toBe(true)

        const byStatus = await Task.list({ status: "doing" })
        expect(byStatus.map((item) => item.id)).toContain(a.id)
        expect(byStatus.map((item) => item.id)).not.toContain(b.id)
      },
    })
  })
})
