import { For, Show, createEffect, createMemo, on } from "solid-js"
import { createStore } from "solid-js/store"
import { useParams } from "@solidjs/router"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { usePrompt } from "@/context/prompt"
import { useSDK } from "@/context/sdk"
import { useServer } from "@/context/server"
import {
  type AuditInfo,
  type TaskFilterStatus,
  type TaskInfo,
  type TaskStatus,
  blankDraft,
  buildSummary,
  lines,
  statusFlow,
  text,
} from "./session-task-dock-summary"

const specDocs = ["requirements.md", "design.md", "task.md"] as const

>>>>>>> origin/dev
export function SessionTaskDock() {
  const params = useParams()
  const sdk = useSDK()
  const server = useServer()
  const prompt = usePrompt()

  const [store, setStore] = createStore({
    collapsed: true,
    loading: false,
    saving: false,
    building: false,
    summary: "",
    summary_open: false,
    mode: "view" as "view" | "create" | "edit",
    selected: undefined as string | undefined,
    tasks: [] as TaskInfo[],
    filter: {
      assignee: "",
      status: "all" as TaskFilterStatus,
    },
    draft: blankDraft(),
  })

  const task = createMemo(() => store.tasks.find((item) => item.id === store.selected))
  const assignees = createMemo(() => [...new Set(store.tasks.map((item) => item.assignee))].sort())
  const next = createMemo(() => {
    const current = task()?.status
    if (!current) return [] as TaskStatus[]
    return statusFlow[current]
  })

  const error = (input: unknown) => {
    const description = input instanceof Error ? input.message : String(input)
    showToast({
      title: "Request failed",
      description,
    })
  }

  const request = async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    const directory = /[^\x00-\x7F]/.test(sdk.directory) ? encodeURIComponent(sdk.directory) : sdk.directory
    headers.set("x-opencode-directory", directory)
    if (init.body) headers.set("Content-Type", "application/json")

    const conn = server.current?.http
    if (conn?.password) {
      const auth = btoa(`${conn.username ?? "opencode"}:${conn.password}`)
      headers.set("Authorization", `Basic ${auth}`)
    }

    const response = await fetch(`${sdk.url}${path}`, {
      ...init,
      headers,
    })
    const raw = await response.text()
    const data = (() => {
      if (!raw) return undefined
      try {
        return JSON.parse(raw) as unknown
      } catch {
        return raw
      }
    })()
    if (response.ok) return data

    if (typeof data === "object" && data && "message" in data && typeof data.message === "string") {
      throw new Error(data.message)
    }
    throw new Error(`Request failed (${response.status})`)
  }

  const refresh = async () => {
    const sessionID = params.id
    if (!sessionID) return

    const query = new URLSearchParams({
      session_id: sessionID,
      limit: "200",
    })
    if (store.filter.assignee.trim()) query.set("assignee", store.filter.assignee.trim())
    if (store.filter.status !== "all") query.set("status", store.filter.status)

    setStore("loading", true)
    try {
      const data = await request(`/task?${query.toString()}`)
      const list = Array.isArray(data) ? (data as TaskInfo[]) : []
      setStore("tasks", list)

      const keep = store.selected && list.some((item) => item.id === store.selected) ? store.selected : list[0]?.id
      setStore("selected", keep)
      if (!keep && store.mode !== "create") setStore("mode", "view")
    } catch (input) {
      error(input)
    } finally {
      setStore("loading", false)
    }
  }

  createEffect(
    on(
      () => [params.id, store.filter.assignee, store.filter.status] as const,
      ([id]) => {
        if (!id) {
          setStore("tasks", [])
          setStore("selected", undefined)
          setStore("mode", "view")
          return
        }
        void refresh()
      },
      { defer: true },
    ),
  )

  const pick = (id: string) => {
    setStore("selected", id)
    setStore("mode", "view")
  }

  const startCreate = () => {
    setStore("mode", "create")
    setStore("selected", undefined)
    setStore("draft", {
      ...blankDraft(),
      assignee: store.filter.assignee.trim(),
    })
  }

  const startEdit = () => {
    const current = task()
    if (!current) return
    setStore("mode", "edit")
    setStore("draft", {
      title: current.title,
      description: current.description,
      assignee: current.assignee,
      dependencies: text(current.dependencies),
      acceptance_criteria: text(current.acceptance_criteria),
      context_refs: text(current.context_refs),
    })
  }

  const cancel = () => {
    setStore("mode", "view")
    setStore("draft", blankDraft())
  }

  const save = async () => {
    const sessionID = params.id
    if (!sessionID) return
    const title = store.draft.title.trim()
    const description = store.draft.description.trim()
    const assignee = store.draft.assignee.trim()
    if (!title || !description || !assignee) {
      showToast({
        title: "Missing required fields",
        description: "Title, description, and assignee are required.",
      })
      return
    }

    setStore("saving", true)
    try {
      if (store.mode === "create") {
        const created = (await request("/task", {
          method: "POST",
          body: JSON.stringify({
            id: crypto.randomUUID(),
            title,
            description,
            assignee,
            status: "todo" as TaskStatus,
            dependencies: lines(store.draft.dependencies),
            acceptance_criteria: lines(store.draft.acceptance_criteria),
            context_refs: lines(store.draft.context_refs),
            session_id: sessionID,
          }),
        })) as TaskInfo
        setStore("mode", "view")
        setStore("selected", created.id)
      }

      if (store.mode === "edit") {
        const id = store.selected
        if (!id) return
        await request(`/task/${id}`, {
          method: "PATCH",
          body: JSON.stringify({
            title,
            description,
            assignee,
            dependencies: lines(store.draft.dependencies),
            acceptance_criteria: lines(store.draft.acceptance_criteria),
            context_refs: lines(store.draft.context_refs),
            session_id: sessionID,
          }),
        })
        setStore("mode", "view")
      }

      await refresh()
    } catch (input) {
      error(input)
    } finally {
      setStore("saving", false)
    }
  }

  const setStatus = async (status: TaskStatus) => {
    const id = store.selected
    if (!id) return
    setStore("saving", true)
    try {
      await request(`/task/${id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      })
      await refresh()
    } catch (input) {
      error(input)
    } finally {
      setStore("saving", false)
    }
  }

  const inject = (path: string) => {
    prompt.context.add({
      type: "file",
      path,
    })
    showToast({
      title: "Context added",
      description: path,
    })
  }

  const build = async () => {
    const sessionID = params.id
    if (!sessionID) return
    setStore("building", true)
    try {
      const [taskData, auditData] = await Promise.all([
        request(`/task?session_id=${sessionID}&limit=500`),
        request(`/audit?session_id=${sessionID}&limit=1000`),
      ])
      const tasks = Array.isArray(taskData) ? (taskData as TaskInfo[]) : []
      const events = Array.isArray(auditData) ? (auditData as AuditInfo[]) : []
      setStore("summary", buildSummary(tasks, events))
      setStore("summary_open", true)
    } catch (input) {
      error(input)
    } finally {
      setStore("building", false)
    }
  }

  const copy = async () => {
    if (!store.summary.trim()) return
    try {
      await navigator.clipboard.writeText(store.summary)
      showToast({
        title: "Summary copied",
        description: "You can paste it into PR description.",
      })
    } catch (input) {
      error(input)
    }
  }

  return (
    <div data-component="session-task-dock" class="mt-2 rounded-md border border-border-weak-base bg-background-base">
      <button
        type="button"
        class="w-full px-3 py-2 flex items-center gap-2 text-left"
        onClick={() => setStore("collapsed", (value) => !value)}
      >
        <div class="text-13-medium text-text-strong">Task Board</div>
        <div class="text-12-regular text-text-weak">{store.tasks.length}</div>
        <div class="ml-auto text-text-weak" classList={{ "rotate-180": !store.collapsed }}>
          <Icon name="chevron-down" size="small" />
        </div>
      </button>

      <Show when={!store.collapsed}>
        <div class="border-t border-border-weak-base p-2 flex flex-col gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <For each={specDocs}>
              {(path) => (
                <Button size="small" variant="ghost" onClick={() => inject(path)}>
                  @{path}
                </Button>
              )}
            </For>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <input
              value={store.filter.assignee}
              onInput={(event) => setStore("filter", "assignee", event.currentTarget.value)}
              placeholder="Filter assignee"
              class="h-8 min-w-35 px-2 rounded border border-border-weak-base bg-background-stronger text-12-regular text-text-strong"
            />
            <select
              value={store.filter.status}
              onChange={(event) => setStore("filter", "status", event.currentTarget.value as TaskFilterStatus)}
              class="h-8 px-2 rounded border border-border-weak-base bg-background-stronger text-12-regular text-text-strong"
            >
              <option value="all">all status</option>
              <option value="todo">todo</option>
              <option value="doing">doing</option>
              <option value="blocked">blocked</option>
              <option value="done">done</option>
            </select>

            <Show when={assignees().length > 0}>
              <select
                value=""
                onChange={(event) => {
                  const value = event.currentTarget.value
                  if (!value) return
                  setStore("filter", "assignee", value)
                  event.currentTarget.value = ""
                }}
                class="h-8 px-2 rounded border border-border-weak-base bg-background-stronger text-12-regular text-text-strong"
              >
                <option value="">pick assignee</option>
                <For each={assignees()}>{(assignee) => <option value={assignee}>{assignee}</option>}</For>
              </select>
            </Show>

            <div class="ml-auto flex items-center gap-2">
              <Button size="small" variant="ghost" disabled={store.building} onClick={() => void build()}>
                {store.building ? "Building..." : "Build Summary"}
              </Button>
              <Button size="small" variant="secondary" disabled={store.loading} onClick={() => void refresh()}>
                Refresh
              </Button>
              <Button size="small" disabled={store.saving} onClick={startCreate}>
                New Task
              </Button>
            </div>
          </div>

          <Show when={store.summary_open}>
            <div class="rounded border border-border-weak-base bg-background-base p-2 flex flex-col gap-2">
              <div class="flex items-center gap-2">
                <div class="text-12-medium text-text-strong">Session Delivery Summary</div>
                <div class="ml-auto flex items-center gap-2">
                  <Button size="small" variant="secondary" onClick={() => void copy()}>
                    Copy
                  </Button>
                  <Button size="small" variant="ghost" onClick={() => setStore("summary_open", false)}>
                    Hide
                  </Button>
                </div>
              </div>
              <textarea
                readOnly
                value={store.summary}
                rows={10}
                class="w-full p-2 rounded border border-border-weak-base bg-background-stronger text-12-regular text-text-strong"
              />
            </div>
          </Show>

          <div class="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-2">
            <div class="max-h-72 overflow-y-auto rounded border border-border-weak-base bg-background-stronger">
              <Show when={!store.loading} fallback={<div class="p-2 text-12-regular text-text-weak">Loading tasks...</div>}>
                <Show when={store.tasks.length > 0} fallback={<div class="p-2 text-12-regular text-text-weak">No tasks</div>}>
                  <For each={store.tasks}>
                    {(item) => (
                      <button
                        type="button"
                        class="w-full p-2 border-b border-border-weak-base text-left"
                        classList={{
                          "bg-surface-base-active": store.selected === item.id && store.mode !== "create",
                        }}
                        onClick={() => pick(item.id)}
                      >
                        <div class="truncate text-12-medium text-text-strong">{item.title}</div>
                        <div class="truncate text-11-regular text-text-weak">
                          {item.assignee} · {item.status}
                        </div>
                      </button>
                    )}
                  </For>
                </Show>
              </Show>
            </div>

            <div class="rounded border border-border-weak-base bg-background-stronger p-2">
              <Show when={store.mode === "create" || store.mode === "edit"} fallback={<Show when={task()} fallback={<div class="text-12-regular text-text-weak">Select a task to view details.</div>}>
                {(item) => (
                  <div class="flex flex-col gap-2">
                    <div class="flex items-center gap-2">
                      <div class="text-13-medium text-text-strong">{item().title}</div>
                      <div class="text-11-regular text-text-weak">{item().status}</div>
                      <div class="ml-auto">
                        <Button size="small" variant="secondary" disabled={store.saving} onClick={startEdit}>
                          Edit
                        </Button>
                      </div>
                    </div>

                    <div class="text-12-regular text-text-strong whitespace-pre-wrap">{item().description}</div>
                    <div class="text-11-regular text-text-weak">assignee: {item().assignee}</div>

                    <Show when={item().dependencies.length > 0}>
                      <div class="text-11-regular text-text-weak">dependencies: {item().dependencies.join(", ")}</div>
                    </Show>

                    <Show when={item().acceptance_criteria.length > 0}>
                      <div class="flex flex-col gap-1">
                        <div class="text-11-regular text-text-weak">acceptance criteria</div>
                        <ul class="list-disc pl-4 text-12-regular text-text-strong">
                          <For each={item().acceptance_criteria}>{(line) => <li>{line}</li>}</For>
                        </ul>
                      </div>
                    </Show>

                    <Show when={item().context_refs.length > 0}>
                      <div class="flex flex-col gap-1">
                        <div class="text-11-regular text-text-weak">context refs</div>
                        <div class="flex flex-wrap gap-1">
                          <For each={item().context_refs}>
                            {(path) => (
                              <Button size="small" variant="ghost" onClick={() => inject(path)}>
                                @{path}
                              </Button>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>

                    <Show when={next().length > 0}>
                      <div class="flex items-center gap-2 flex-wrap">
                        <div class="text-11-regular text-text-weak">next status</div>
                        <For each={next()}>
                          {(status) => (
                            <Button size="small" disabled={store.saving} onClick={() => void setStatus(status)}>
                              {status}
                            </Button>
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                )}
              </Show>}>
                <div class="flex flex-col gap-2">
                  <div class="text-13-medium text-text-strong">
                    {store.mode === "create" ? "Create task" : "Edit task"}
                  </div>
                  <input
                    value={store.draft.title}
                    onInput={(event) => setStore("draft", "title", event.currentTarget.value)}
                    placeholder="title"
                    class="h-8 px-2 rounded border border-border-weak-base bg-background-base text-12-regular text-text-strong"
                  />
                  <textarea
                    value={store.draft.description}
                    onInput={(event) => setStore("draft", "description", event.currentTarget.value)}
                    placeholder="description"
                    rows={3}
                    class="p-2 rounded border border-border-weak-base bg-background-base text-12-regular text-text-strong"
                  />
                  <input
                    value={store.draft.assignee}
                    onInput={(event) => setStore("draft", "assignee", event.currentTarget.value)}
                    placeholder="assignee"
                    class="h-8 px-2 rounded border border-border-weak-base bg-background-base text-12-regular text-text-strong"
                  />
                  <textarea
                    value={store.draft.dependencies}
                    onInput={(event) => setStore("draft", "dependencies", event.currentTarget.value)}
                    placeholder="dependencies (one task id per line)"
                    rows={2}
                    class="p-2 rounded border border-border-weak-base bg-background-base text-12-regular text-text-strong"
                  />
                  <textarea
                    value={store.draft.acceptance_criteria}
                    onInput={(event) => setStore("draft", "acceptance_criteria", event.currentTarget.value)}
                    placeholder="acceptance criteria (one line per item)"
                    rows={3}
                    class="p-2 rounded border border-border-weak-base bg-background-base text-12-regular text-text-strong"
                  />
                  <textarea
                    value={store.draft.context_refs}
                    onInput={(event) => setStore("draft", "context_refs", event.currentTarget.value)}
                    placeholder="context refs (one file path per line)"
                    rows={2}
                    class="p-2 rounded border border-border-weak-base bg-background-base text-12-regular text-text-strong"
                  />
                  <div class="flex items-center justify-end gap-2">
                    <Button size="small" variant="ghost" disabled={store.saving} onClick={cancel}>
                      Cancel
                    </Button>
                    <Button size="small" disabled={store.saving} onClick={() => void save()}>
                      Save
                    </Button>
                  </div>
                </div>
              </Show>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
