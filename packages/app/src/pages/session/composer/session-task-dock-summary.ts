export type TaskStatus = "todo" | "doing" | "blocked" | "done"
export type TaskFilterStatus = TaskStatus | "all"

export type TaskInfo = {
  id: string
  title: string
  description: string
  assignee: string
  status: TaskStatus
  dependencies: string[]
  acceptance_criteria: string[]
  context_refs: string[]
  session_id?: string
  time: {
    created: number
    updated: number
  }
}

export type AuditType = "command" | "file_change" | "test" | "commit"

export type AuditInfo = {
  id: string
  task_id?: string
  session_id: string
  type: AuditType
  payload: Record<string, unknown>
  created_at: number
}

export const statusFlow: Record<TaskStatus, TaskStatus[]> = {
  todo: ["doing"],
  doing: ["blocked", "done"],
  blocked: ["doing"],
  done: [],
}

export function blankDraft() {
  return {
    title: "",
    description: "",
    assignee: "",
    dependencies: "",
    acceptance_criteria: "",
    context_refs: "",
  }
}

export function lines(input: string) {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !!line)
}

export function text(input: string[]) {
  return input.join("\n")
}

function collect(input: unknown, keys: Set<string>, out: Set<string>) {
  if (Array.isArray(input)) {
    for (const item of input) collect(item, keys, out)
    return
  }
  if (typeof input !== "object" || !input) return
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" && keys.has(key.toLowerCase()) && value.trim()) out.add(value.trim())
    if (typeof value === "object" && value) collect(value, keys, out)
  }
}

function first(input: unknown, key: string): string | undefined {
  if (Array.isArray(input)) {
    for (const item of input) {
      const value = first(item, key)
      if (value) return value
    }
    return
  }
  if (typeof input !== "object" || !input) return
  for (const [item, value] of Object.entries(input)) {
    if (item.toLowerCase() === key && typeof value === "string" && value.trim()) return value.trim()
  }
  for (const value of Object.values(input)) {
    const found = first(value, key)
    if (found) return found
  }
}

function changed(payload: unknown) {
  if (typeof payload !== "object" || !payload) return []
  const source = payload as Record<string, unknown>
  const next = source.changed_files
  if (Array.isArray(next)) {
    const files = next
      .filter((item): item is string => typeof item === "string" && !!item.trim())
      .map((item) => item.trim())
    return [...new Set(files)].sort()
  }
  const keys = new Set(["path", "file", "filename", "file_path", "filepath"])
  const out = new Set<string>()
  collect(payload, keys, out)
  return [...out].sort()
}

export function buildSummary(tasks: TaskInfo[], events: AuditInfo[]) {
  const done = tasks.filter((item) => item.status === "done")
  const next = tasks.filter((item) => item.status !== "done")
  const blocked = tasks.filter((item) => item.status === "blocked")
  const files = new Set<string>()
  for (const event of events) {
    if (event.type !== "file_change") continue
    for (const file of changed(event.payload)) files.add(file)
  }

  const tests = events
    .filter((item) => item.type === "test")
    .map((item) => {
      const status = first(item.payload, "status")
      const command = first(item.payload, "command") ?? first(item.payload, "title") ?? "test command"
      const icon = status === "completed" ? "PASS" : status === "error" ? "FAIL" : "INFO"
      return `- ${icon}: ${command}`
    })

  const risks = [
    ...blocked.map((item) => `- [${item.id}] ${item.title} is blocked.`),
    ...(tests.some((item) => item.startsWith("- FAIL"))
      ? ["- At least one test command failed. Check audit timeline for details."]
      : []),
    ...(done.length === 0 ? ["- No completed tasks yet for this session."] : []),
  ]

  const list = done.length
    ? done.map((item) => `- [${item.id}] ${item.title} (@${item.assignee})`).join("\n")
    : "- none"
  const fileList = files.size ? [...files].sort().map((item) => `- ${item}`).join("\n") : "- none"
  const testList = tests.length ? tests.join("\n") : "- none"
  const riskList = risks.length ? risks.join("\n") : "- none"
  const nextList = next.length
    ? next.map((item) => `- [${item.id}] ${item.title} (${item.status})`).join("\n")
    : "- none"

  return [
    "## Delivery Summary",
    "",
    "### Completed Tasks",
    list,
    "",
    "### Changes",
    fileList,
    "",
    "### Test Results",
    testList,
    "",
    "### Risks",
    riskList,
    "",
    "### Next Steps",
    nextList,
  ].join("\n")
}
