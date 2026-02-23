import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { Audit } from "@/task"
import { errors } from "../error"
import { lazy } from "../../util/lazy"

export const AuditRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List audit events",
        description: "List structured execution audit events by task_id or session_id.",
        operationId: "audit.list",
        responses: {
          200: {
            description: "Audit event list",
            content: {
              "application/json": {
                schema: resolver(Audit.Info.array()),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "query",
        z.object({
          task_id: z.string().optional(),
          session_id: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(1000).optional(),
        }),
      ),
      async (c) => {
        const items = await Audit.list(c.req.valid("query"))
        return c.json(items)
      },
    ),
)
