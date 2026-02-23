import { describe, expect, test } from "bun:test"
import {
  buildSummary,
  lines,
  statusFlow,
  text,
  type AuditInfo,
  type TaskInfo,
} from "./session-task-dock-summary"

const task = (input: Partial<TaskInfo> & Pick<TaskInfo, "id" | "title" | "status" | "assignee">): TaskInfo => ({
  id: input.id,
  title: input.title,
  description: input.description ?? "",
  assignee: input.assignee,
  status: input.status,
  dependencies: input.dependencies ?? [],
  acceptance_criteria: input.acceptance_criteria ?? [],
  context_refs: input.context_refs ?? [],
  session_id: input.session_id,
  time: input.time ?? { created: 1, updated: 1 },
})

const event = (input: Pick<AuditInfo, "id" | "type"> & Partial<AuditInfo>): AuditInfo => ({
  id: input.id,
  task_id: input.task_id,
  session_id: input.session_id ?? "s1",
  type: input.type,
  payload: input.payload ?? {},
  created_at: input.created_at ?? 1,
})

describe("session task dock helpers", () => {
  test("normalizes newline text values", () => {
    expect(lines(" a\n\n b \n  \n c")).toEqual(["a", "b", "c"])
    expect(text(["a", "b", "c"])).toBe("a\nb\nc")
  })

  test("keeps declared status transitions", () => {
    expect(statusFlow.todo).toEqual(["doing"])
    expect(statusFlow.doing).toEqual(["blocked", "done"])
    expect(statusFlow.blocked).toEqual(["doing"])
    expect(statusFlow.done).toEqual([])
  })

  test("builds summary from tasks and audit events", () => {
    const value = buildSummary(
      [
        task({
          id: "T06",
          title: "Generate delivery summary",
          assignee: "cursor-agent",
          status: "done",
        }),
        task({
          id: "T08",
          title: "Investigate failed regression",
          assignee: "cursor-agent",
          status: "blocked",
        }),
      ],
      [
        event({
          id: "a1",
          type: "file_change",
          payload: {
            changed_files: ["src/z.ts", "src/a.ts", "src/z.ts"],
            input: { path: "/tmp/noise.log" },
          },
        }),
        event({
          id: "a2",
          type: "file_change",
          payload: {
            input: { filePath: "src/c.ts" },
          },
        }),
        event({
          id: "a3",
          type: "test",
          payload: {
            status: "completed",
            input: { command: "bun test ./src/pages/session" },
          },
        }),
        event({
          id: "a4",
          type: "test",
          payload: {
            status: "error",
            title: "vitest task dock suite",
          },
        }),
      ],
    )

    expect(value).toContain("## Delivery Summary")
    expect(value).toContain("- [T06] Generate delivery summary (@cursor-agent)")
    expect(value).toContain("- src/a.ts")
    expect(value).toContain("- src/c.ts")
    expect(value).toContain("- src/z.ts")
    expect(value).not.toContain("/tmp/noise.log")
    expect(value).toContain("- PASS: bun test ./src/pages/session")
    expect(value).toContain("- FAIL: vitest task dock suite")
    expect(value).toContain("- [T08] Investigate failed regression is blocked.")
    expect(value).toContain("- At least one test command failed. Check audit timeline for details.")
    expect(value).toContain("- [T08] Investigate failed regression (blocked)")
  })

  test("uses empty placeholders when no audit output exists", () => {
    const value = buildSummary(
      [
        task({
          id: "T09",
          title: "Prepare follow-up",
          assignee: "cursor-agent",
          status: "todo",
        }),
      ],
      [],
    )

    expect(value).toContain("### Completed Tasks\n- none")
    expect(value).toContain("### Changes\n- none")
    expect(value).toContain("### Test Results\n- none")
    expect(value).toContain("- No completed tasks yet for this session.")
    expect(value).toContain("- [T09] Prepare follow-up (todo)")
  })
})
