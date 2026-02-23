import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { fn } from "@/util/fn"
import { Database, NotFoundError, and, desc, eq, inArray } from "@/storage/db"
import { TaskTable } from "./task.sql"
import z from "zod"

export namespace Task {
  export const Status = z.enum(["todo", "doing", "blocked", "done"]).meta({
    ref: "TaskStatus",
  })
  export type Status = z.infer<typeof Status>

  export const Info = z
    .object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      assignee: z.string(),
      status: Status,
      dependencies: z.array(z.string()),
      acceptance_criteria: z.array(z.string()),
      context_refs: z.array(z.string()),
      session_id: z.string().optional(),
      time: z.object({
        created: z.number(),
        updated: z.number(),
      }),
    })
    .meta({
      ref: "Task",
    })
  export type Info = z.infer<typeof Info>

  export const Event = {
    Created: BusEvent.define("task.created", z.object({ task: Info })),
    Updated: BusEvent.define("task.updated", z.object({ task: Info })),
    Deleted: BusEvent.define("task.deleted", z.object({ id: z.string() })),
  }

  const flow = {
    todo: ["doing"],
    doing: ["blocked", "done"],
    blocked: ["doing"],
    done: [],
  } as const

  type Row = typeof TaskTable.$inferSelect

  function fromRow(row: Row): Info {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      assignee: row.assignee,
      status: Status.parse(row.status),
      dependencies: row.dependencies,
      acceptance_criteria: row.acceptance_criteria,
      context_refs: row.context_refs,
      session_id: row.session_id ?? undefined,
      time: {
        created: row.time_created,
        updated: row.time_updated,
      },
    }
  }

  export const create = fn(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      assignee: z.string(),
      status: Status.default("todo"),
      dependencies: z.array(z.string()).default([]),
      acceptance_criteria: z.array(z.string()).default([]),
      context_refs: z.array(z.string()).default([]),
      session_id: z.string().optional(),
    }),
    async (input) => {
      const now = Date.now()
      const row = Database.use((db) =>
        db
          .insert(TaskTable)
          .values({
            id: input.id,
            title: input.title,
            description: input.description,
            assignee: input.assignee,
            status: input.status,
            dependencies: input.dependencies,
            acceptance_criteria: input.acceptance_criteria,
            context_refs: input.context_refs,
            session_id: input.session_id ?? null,
            time_created: now,
            time_updated: now,
          })
          .returning()
          .get(),
      )
      if (!row) throw new Error("Failed to create task")
      const task = fromRow(row)
      await Bus.publish(Event.Created, { task })
      return task
    },
  )

  export const get = fn(z.string(), async (id) => {
    const row = Database.use((db) => db.select().from(TaskTable).where(eq(TaskTable.id, id)).get())
    if (!row) throw new NotFoundError({ message: `Task not found: ${id}` })
    return fromRow(row)
  })

  export const update = fn(
    z.object({
      id: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      assignee: z.string().optional(),
      dependencies: z.array(z.string()).optional(),
      acceptance_criteria: z.array(z.string()).optional(),
      context_refs: z.array(z.string()).optional(),
      session_id: z.string().nullable().optional(),
    }),
    async (input) => {
      const set = {
        title: input.title,
        description: input.description,
        assignee: input.assignee,
        dependencies: input.dependencies,
        acceptance_criteria: input.acceptance_criteria,
        context_refs: input.context_refs,
        session_id: input.session_id,
        time_updated: Date.now(),
      }
      const row = Database.use((db) =>
        db.update(TaskTable).set(set).where(eq(TaskTable.id, input.id)).returning().get(),
      )
      if (!row) throw new NotFoundError({ message: `Task not found: ${input.id}` })
      const task = fromRow(row)
      await Bus.publish(Event.Updated, { task })
      return task
    },
  )

  export const set_status = fn(
    z.object({
      id: z.string(),
      status: Status,
    }),
    async (input) => {
      const row = Database.use((db) => db.select().from(TaskTable).where(eq(TaskTable.id, input.id)).get())
      if (!row) throw new NotFoundError({ message: `Task not found: ${input.id}` })
      const from = Status.parse(row.status)
      if (from !== input.status && !flow[from].includes(input.status)) {
        throw new Error(`Invalid task status transition: ${from} -> ${input.status}`)
      }
      const next = Database.use((db) =>
        db
          .update(TaskTable)
          .set({ status: input.status, time_updated: Date.now() })
          .where(eq(TaskTable.id, input.id))
          .returning()
          .get(),
      )
      if (!next) throw new NotFoundError({ message: `Task not found: ${input.id}` })
      const task = fromRow(next)
      await Bus.publish(Event.Updated, { task })
      return task
    },
  )

  export const remove = fn(z.string(), async (id) => {
    const row = Database.use((db) => db.delete(TaskTable).where(eq(TaskTable.id, id)).returning().get())
    if (!row) throw new NotFoundError({ message: `Task not found: ${id}` })
    await Bus.publish(Event.Deleted, { id })
    return true
  })

  export const list = fn(
    z
      .object({
        assignee: z.string().optional(),
        status: Status.optional(),
        session_id: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
      .optional(),
    async (input) => {
      const query = input ?? {}
      const where = []
      if (query.assignee) where.push(eq(TaskTable.assignee, query.assignee))
      if (query.status) where.push(eq(TaskTable.status, query.status))
      if (query.session_id) where.push(eq(TaskTable.session_id, query.session_id))
      const rows = Database.use((db) => {
        if (where.length === 0) {
          return db
            .select()
            .from(TaskTable)
            .orderBy(desc(TaskTable.time_updated), desc(TaskTable.id))
            .limit(query.limit ?? 100)
            .all()
        }
        return db
          .select()
          .from(TaskTable)
          .where(and(...where))
          .orderBy(desc(TaskTable.time_updated), desc(TaskTable.id))
          .limit(query.limit ?? 100)
          .all()
      })
      return rows.map(fromRow)
    },
  )

  export function active_for_session(session_id: string) {
    const active = ["todo", "doing", "blocked"]
    const row = Database.use((db) =>
      db
        .select()
        .from(TaskTable)
        .where(and(eq(TaskTable.session_id, session_id), inArray(TaskTable.status, active)))
        .orderBy(desc(TaskTable.time_updated), desc(TaskTable.id))
        .get(),
    )
    if (row) return fromRow(row)
    const latest = Database.use((db) =>
      db
        .select()
        .from(TaskTable)
        .where(eq(TaskTable.session_id, session_id))
        .orderBy(desc(TaskTable.time_updated), desc(TaskTable.id))
        .get(),
    )
    if (!latest) return
    return fromRow(latest)
  }
}
