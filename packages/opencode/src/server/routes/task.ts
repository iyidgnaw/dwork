import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { Task } from "@/task"
import { errors } from "../error"
import { lazy } from "../../util/lazy"

export const TaskRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List tasks",
        description: "List task board items with optional filters by assignee, status, and session.",
        operationId: "task.list",
        responses: {
          200: {
            description: "Task list",
            content: {
              "application/json": {
                schema: resolver(Task.Info.array()),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          assignee: z.string().optional(),
          status: Task.Status.optional(),
          session_id: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(500).optional(),
        }),
      ),
      async (c) => {
        const query = c.req.valid("query")
        const tasks = await Task.list(query)
        return c.json(tasks)
      },
    )
    .get(
      "/:taskID",
      describeRoute({
        summary: "Get task",
        description: "Get a task by id.",
        operationId: "task.get",
        responses: {
          200: {
            description: "Task item",
            content: {
              "application/json": {
                schema: resolver(Task.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ taskID: z.string() })),
      async (c) => {
        const task = await Task.get(c.req.valid("param").taskID)
        return c.json(task)
      },
    )
    .post(
      "/",
      describeRoute({
        summary: "Create task",
        description: "Create a task board item.",
        operationId: "task.create",
        responses: {
          200: {
            description: "Created task",
            content: {
              "application/json": {
                schema: resolver(Task.Info),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", Task.create.schema),
      async (c) => {
        const task = await Task.create(c.req.valid("json"))
        return c.json(task)
      },
    )
    .patch(
      "/:taskID",
      describeRoute({
        summary: "Update task",
        description: "Update fields on a task board item.",
        operationId: "task.update",
        responses: {
          200: {
            description: "Updated task",
            content: {
              "application/json": {
                schema: resolver(Task.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ taskID: z.string() })),
      validator("json", Task.update.schema.omit({ id: true })),
      async (c) => {
        const body = c.req.valid("json")
        const taskID = c.req.valid("param").taskID
        const task = await Task.update({ ...body, id: taskID })
        return c.json(task)
      },
    )
    .post(
      "/:taskID/status",
      describeRoute({
        summary: "Set task status",
        description: "Set a task status while enforcing state transitions.",
        operationId: "task.setStatus",
        responses: {
          200: {
            description: "Updated task status",
            content: {
              "application/json": {
                schema: resolver(Task.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ taskID: z.string() })),
      validator("json", Task.set_status.schema.omit({ id: true })),
      async (c) => {
        const body = c.req.valid("json")
        const taskID = c.req.valid("param").taskID
        const task = await Task.set_status({ id: taskID, status: body.status })
        return c.json(task)
      },
    )
    .delete(
      "/:taskID",
      describeRoute({
        summary: "Delete task",
        description: "Delete a task board item.",
        operationId: "task.delete",
        responses: {
          200: {
            description: "Deleted task",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ taskID: z.string() })),
      async (c) => {
        await Task.remove(c.req.valid("param").taskID)
        return c.json(true)
      },
    ),
)
