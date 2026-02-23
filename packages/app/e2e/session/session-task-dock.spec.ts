import { test, expect } from "../fixtures"
import { withSession } from "../actions"
import { sessionTaskDockSelector, toastSelector, toastTitleSelector } from "../selectors"

test.setTimeout(120_000)

test("task dock supports create edit status transitions and summary copy", async ({ page, sdk, gotoSession }) => {
  await withSession(sdk, `e2e task dock ${Date.now()}`, async (session) => {
    await gotoSession(session.id)
    const dock = page.locator(sessionTaskDockSelector)
    await expect(dock).toBeVisible()

    const opened = await dock
      .getByRole("button", { name: "New Task" })
      .isVisible()
      .then((x) => x)
      .catch(() => false)
    if (!opened) await dock.getByRole("button", { name: /task board/i }).first().click()
    await expect(dock.getByRole("button", { name: "New Task" })).toBeVisible()

    await dock.getByRole("button", { name: "New Task" }).click()
    await dock.getByRole("button", { name: "Save" }).click()

    const validationToast = page
      .locator(toastSelector)
      .filter({
        has: page.locator(toastTitleSelector).filter({ hasText: "Missing required fields" }),
      })
      .first()
    await expect(validationToast).toBeVisible()

    const title = `task dock flow ${Date.now()}`
    const updated = `${title} updated`
    await dock.getByPlaceholder("title").fill(title)
    await dock.getByPlaceholder("description").fill("cover task creation and edit flow")
    await dock.getByRole("textbox", { name: "assignee", exact: true }).fill("cursor-agent")
    await dock.getByPlaceholder(/acceptance criteria/i).fill("can create and update tasks")
    await dock.getByRole("button", { name: "Save" }).click()

    const row = dock.locator("button").filter({ hasText: title }).first()
    await expect(row).toBeVisible()
    await row.click()

    await dock.getByRole("button", { name: "Edit" }).click()
    await dock.getByPlaceholder("title").fill(updated)
    await dock.getByPlaceholder("description").fill("cover task status transitions and summary copy")
    await dock.getByRole("button", { name: "Save" }).click()

    const updatedRow = dock.locator("button").filter({ hasText: updated }).first()
    await expect(updatedRow).toBeVisible()
    await updatedRow.click()

    await dock.getByRole("button", { name: "doing" }).click()
    await expect
      .poll(async () => (await dock.locator("button").filter({ hasText: updated }).first().textContent()) ?? "")
      .toContain("cursor-agent · doing")

    await dock.getByRole("button", { name: "done" }).click()
    await expect
      .poll(async () => (await dock.locator("button").filter({ hasText: updated }).first().textContent()) ?? "")
      .toContain("cursor-agent · done")

    await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(page.url()).origin })
    await dock.getByRole("button", { name: "Build Summary" }).click()

    const summary = dock.locator("textarea").first()
    await expect(summary).toBeVisible()
    await expect(summary).toHaveValue(/## Delivery Summary/)
    await expect(summary).toHaveValue(new RegExp(updated.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))

    await dock.getByRole("button", { name: "Copy" }).click()
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toContain("## Delivery Summary")
  })
})
