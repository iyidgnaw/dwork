import { test, expect } from "../fixtures"
import { withSession } from "../actions"
import { promptSelector } from "../selectors"
import { serverUrl } from "../utils"

const taskDockSelector = '[data-component="session-task-dock"]'

async function createTask(sessionID: string, task: {
  id: string
  title: string
  description: string
  assignee: string
  status: "todo" | "doing" | "blocked" | "done"
  dependencies?: string[]
  acceptance_criteria?: string[]
  context_refs?: string[]
}) {
  const response = await fetch(`${serverUrl}/task`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...task,
      dependencies: task.dependencies ?? [],
      acceptance_criteria: task.acceptance_criteria ?? [],
      context_refs: task.context_refs ?? [],
      session_id: sessionID,
    }),
  })
  if (!response.ok) throw new Error(`Failed to create task: ${response.statusText}`)
  return response.json()
}

test("task dock can create and edit tasks", async ({ page, sdk, gotoSession }) => {
  await withSession(sdk, "task dock e2e", async (session) => {
    await gotoSession(session.id)

    const dock = page.locator(taskDockSelector)
    await expect(dock).toBeVisible()

    const toggle = dock.getByRole("button").first()
    await toggle.click()

    await expect(dock.getByRole("button", { name: "New Task" })).toBeVisible()
    await dock.getByRole("button", { name: "New Task" }).click()

    const titleInput = dock.getByPlaceholder("title")
    await expect(titleInput).toBeVisible()
    await titleInput.fill("E2E Test Task")

    const descriptionInput = dock.getByPlaceholder("description")
    await descriptionInput.fill("This is a test task for e2e validation")

    const assigneeInput = dock.getByPlaceholder("assignee")
    await assigneeInput.fill("cursor-agent")

    const criteriaInput = dock.getByPlaceholder(/acceptance criteria/)
    await criteriaInput.fill("Task is created\nTask is visible in list")

    await dock.getByRole("button", { name: "Save" }).click()

    await expect(dock.getByText("E2E Test Task")).toBeVisible()
    await expect(dock.getByText("cursor-agent")).toBeVisible()

    await dock.getByText("E2E Test Task").click()

    await expect(dock.getByRole("button", { name: "Edit" })).toBeVisible()
    await dock.getByRole("button", { name: "Edit" }).click()

    const editTitleInput = dock.getByPlaceholder("title")
    await expect(editTitleInput).toHaveValue("E2E Test Task")
    await editTitleInput.fill("E2E Test Task Updated")

    await dock.getByRole("button", { name: "Save" }).click()

    await expect(dock.getByText("E2E Test Task Updated")).toBeVisible()
  })
})

test("task dock can transition task status", async ({ page, sdk, gotoSession }) => {
  await withSession(sdk, "task status e2e", async (session) => {
    await createTask(session.id, {
      id: `e2e-status-${Date.now()}`,
      title: "Status Transition Test",
      description: "Testing status transitions",
      assignee: "cursor-agent",
      status: "todo",
    })

    await gotoSession(session.id)

    const dock = page.locator(taskDockSelector)
    await expect(dock).toBeVisible()

    const toggle = dock.getByRole("button").first()
    await toggle.click()

    await expect(dock.getByText("Status Transition Test")).toBeVisible()
    await dock.getByText("Status Transition Test").click()

    await expect(dock.getByRole("button", { name: "doing" })).toBeVisible()
    await dock.getByRole("button", { name: "doing" }).click()

    await expect(dock.getByText("doing")).toBeVisible()

    await expect(dock.getByRole("button", { name: "done" })).toBeVisible()
    await dock.getByRole("button", { name: "done" }).click()

    await expect(dock.getByText("done")).toBeVisible()
  })
})

test("task dock can filter by assignee and status", async ({ page, sdk, gotoSession }) => {
  await withSession(sdk, "task filter e2e", async (session) => {
    await Promise.all([
      createTask(session.id, {
        id: `e2e-filter-1-${Date.now()}`,
        title: "Cursor Task",
        description: "Task for cursor",
        assignee: "cursor-agent",
        status: "todo",
      }),
      createTask(session.id, {
        id: `e2e-filter-2-${Date.now()}`,
        title: "Codex Task",
        description: "Task for codex",
        assignee: "codex-agent",
        status: "doing",
      }),
    ])

    await gotoSession(session.id)

    const dock = page.locator(taskDockSelector)
    await expect(dock).toBeVisible()

    const toggle = dock.getByRole("button").first()
    await toggle.click()

    await expect(dock.getByText("Cursor Task")).toBeVisible()
    await expect(dock.getByText("Codex Task")).toBeVisible()

    const assigneeFilter = dock.getByPlaceholder("Filter assignee")
    await assigneeFilter.fill("cursor-agent")

    await expect(dock.getByText("Cursor Task")).toBeVisible()
    await expect(dock.getByText("Codex Task")).not.toBeVisible()

    await assigneeFilter.clear()

    const statusFilter = dock.getByRole("combobox").filter({ hasText: /all status/ }).first()
    await statusFilter.selectOption("doing")

    await expect(dock.getByText("Cursor Task")).not.toBeVisible()
    await expect(dock.getByText("Codex Task")).toBeVisible()
  })
})

test("task dock can build and copy summary", async ({ page, sdk, gotoSession }) => {
  await withSession(sdk, "task summary e2e", async (session) => {
    await createTask(session.id, {
      id: `e2e-summary-${Date.now()}`,
      title: "Summary Test Task",
      description: "Task for summary testing",
      assignee: "cursor-agent",
      status: "done",
      acceptance_criteria: ["Task completed"],
    })

    await gotoSession(session.id)

    const dock = page.locator(taskDockSelector)
    await expect(dock).toBeVisible()

    const toggle = dock.getByRole("button").first()
    await toggle.click()

    const buildButton = dock.getByRole("button", { name: "Build Summary" })
    await expect(buildButton).toBeVisible()
    await buildButton.click()

    await expect(dock.getByText("Session Delivery Summary")).toBeVisible({ timeout: 10_000 })

    const summaryText = dock.getByRole("textbox").filter({ hasText: /Delivery Summary/ })
    await expect(summaryText).toBeVisible()
    const summaryContent = await summaryText.inputValue()

    expect(summaryContent).toContain("## Delivery Summary")
    expect(summaryContent).toContain("Summary Test Task")
    expect(summaryContent).toContain("Completed Tasks")

    const copyButton = dock.getByRole("button", { name: "Copy" })
    await expect(copyButton).toBeVisible()
    await copyButton.click()

    await expect(page.getByText("Summary copied")).toBeVisible()
  })
})

test("task dock can inject spec documents", async ({ page, sdk, gotoSession }) => {
  await withSession(sdk, "task spec injection e2e", async (session) => {
    await gotoSession(session.id)

    const dock = page.locator(taskDockSelector)
    await expect(dock).toBeVisible()

    const toggle = dock.getByRole("button").first()
    await toggle.click()

    const requirementsButton = dock.getByRole("button", { name: "@requirements.md" })
    await expect(requirementsButton).toBeVisible()
    await requirementsButton.click()

    const prompt = page.locator(promptSelector)
    await expect(prompt).toBeVisible()

    const promptValue = await prompt.inputValue()
    expect(promptValue).toContain("requirements.md")

    await prompt.clear()

    const designButton = dock.getByRole("button", { name: "@design.md" })
    await designButton.click()

    const designValue = await prompt.inputValue()
    expect(designValue).toContain("design.md")
  })
})

test("task dock shows validation for invalid status transitions", async ({ page, sdk, gotoSession }) => {
  await withSession(sdk, "task validation e2e", async (session) => {
    await createTask(session.id, {
      id: `e2e-validation-${Date.now()}`,
      title: "Validation Test",
      description: "Testing validation",
      assignee: "cursor-agent",
      status: "todo",
    })

    await gotoSession(session.id)

    const dock = page.locator(taskDockSelector)
    await expect(dock).toBeVisible()

    const toggle = dock.getByRole("button").first()
    await toggle.click()

    await dock.getByText("Validation Test").click()

    const doneButton = dock.getByRole("button", { name: "done" })
    await expect(doneButton).not.toBeVisible()

    await expect(dock.getByRole("button", { name: "doing" })).toBeVisible()
  })
})
