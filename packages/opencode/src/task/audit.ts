import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { MessageV2 } from "@/session/message-v2"
import { Database, NotFoundError, and, desc, eq } from "@/storage/db"
import { fn } from "@/util/fn"
import { Log } from "@/util/log"
import { Instance } from "@/project/instance"
import z from "zod"
import { AuditEventTable } from "./audit.sql"
import { Task } from "./task"

export namespace Audit {
  const log = Log.create({ service: "audit" })
  const file = new Set(["write", "edit", "apply_patch", "multiedit"])
  const testPattern = /(?:^|[\s;&|])(bun test|npm test|pnpm test|yarn test|pytest|go test|cargo test|vitest|jest)(?:[\s;&|]|$)/i
  const commitPattern = /(?:^|[\s;&|])git\s+commit(?:[\s;&|]|$)/i

  export const Type = z.enum(["command", "file_change", "test", "commit"]).meta({
    ref: "AuditType",
  })

  export const Info = z
    .object({
      id: z.string(),
      task_id: z.string().optional(),
      session_id: z.string(),
      source_part_id: z.string().optional(),
      source_call_id: z.string().optional(),
      type: Type,
      payload: z.record(z.string(), z.unknown()),
      created_at: z.number(),
    })
    .meta({
      ref: "AuditEvent",
    })
  export type Info = z.infer<typeof Info>

  export const Event = {
    Created: BusEvent.define("audit.created", z.object({ event: Info })),
  }

  type Row = typeof AuditEventTable.$inferSelect

  function fromRow(row: Row): Info {
    return {
      id: row.id,
      task_id: row.task_id ?? undefined,
      session_id: row.session_id,
      source_part_id: row.source_part_id ?? undefined,
      source_call_id: row.source_call_id ?? undefined,
      type: Type.parse(row.type),
      payload: row.payload,
      created_at: row.created_at,
    }
  }

  function command(part: MessageV2.ToolPart) {
    if (part.tool !== "bash") return ""
    const input = part.state.input
    if (typeof input.command === "string") return input.command
    return ""
  }

  function classify(part: MessageV2.ToolPart) {
    if (file.has(part.tool)) return Type.enum.file_change
    if (part.tool !== "bash") return
    const cmd = command(part)
    if (testPattern.test(cmd)) return Type.enum.test
    if (commitPattern.test(cmd)) return Type.enum.commit
    return Type.enum.command
  }

  export const create = fn(
    z.object({
      session_id: z.string(),
      task_id: z.string().optional(),
      source_part_id: z.string().optional(),
      source_call_id: z.string().optional(),
      type: Type,
      payload: z.record(z.string(), z.unknown()),
      created_at: z.number().optional(),
    }),
    async (input) => {
      if (input.source_part_id) {
        const row = Database.use((db) =>
          db.select().from(AuditEventTable).where(eq(AuditEventTable.source_part_id, input.source_part_id!)).get(),
        )
        if (row) return fromRow(row)
      }
      const row = Database.use((db) =>
        db
          .insert(AuditEventTable)
          .values({
            id: crypto.randomUUID(),
            session_id: input.session_id,
            task_id: input.task_id ?? null,
            source_part_id: input.source_part_id ?? null,
            source_call_id: input.source_call_id ?? null,
            type: input.type,
            payload: input.payload,
            created_at: input.created_at ?? Date.now(),
          })
          .returning()
          .get(),
      )
      if (!row) throw new Error("Failed to create audit event")
      const event = fromRow(row)
      await Bus.publish(Event.Created, { event })
      return event
    },
  )

  export async function record_from_part(part: MessageV2.ToolPart) {
    if (part.state.status !== "completed" && part.state.status !== "error") return
    const type = classify(part)
    if (!type) return
    const task = Task.active_for_session(part.sessionID)
    const payload = {
      tool: part.tool,
      status: part.state.status,
      input: part.state.input,
      ...(part.state.status === "completed"
        ? {
            title: part.state.title,
            metadata: part.state.metadata,
            output: part.state.output,
          }
        : {
            error: part.state.error,
            metadata: part.state.metadata,
          }),
    }
    await create({
      session_id: part.sessionID,
      task_id: task?.id,
      source_part_id: part.id,
      source_call_id: part.callID,
      type,
      payload,
      created_at: Date.now(),
    })
  }

  const state = Instance.state(
    () => {
      const unsub = Bus.subscribe(MessageV2.Event.PartUpdated, async (event) => {
        const part = event.properties.part
        if (part.type !== "tool") return
        await record_from_part(part).catch((error) => {
          log.error("failed to record audit event", { error })
        })
      })
      return {
        unsub,
      }
    },
    async (entry) => {
      entry.unsub()
    },
  )

  export function init() {
    state()
  }

  export const get = fn(z.string(), async (id) => {
    const row = Database.use((db) => db.select().from(AuditEventTable).where(eq(AuditEventTable.id, id)).get())
    if (!row) throw new NotFoundError({ message: `Audit event not found: ${id}` })
    return fromRow(row)
  })

  export const list = fn(
    z
      .object({
        session_id: z.string().optional(),
        task_id: z.string().optional(),
        limit: z.number().int().min(1).max(1000).optional(),
      })
      .optional(),
    async (input) => {
      const query = input ?? {}
      const where = []
      if (query.session_id) where.push(eq(AuditEventTable.session_id, query.session_id))
      if (query.task_id) where.push(eq(AuditEventTable.task_id, query.task_id))
      const rows = Database.use((db) => {
        if (where.length === 0) {
          return db
            .select()
            .from(AuditEventTable)
            .orderBy(desc(AuditEventTable.created_at), desc(AuditEventTable.id))
            .limit(query.limit ?? 200)
            .all()
        }
        return db
          .select()
          .from(AuditEventTable)
          .where(and(...where))
          .orderBy(desc(AuditEventTable.created_at), desc(AuditEventTable.id))
          .limit(query.limit ?? 200)
          .all()
      })
      return rows.map(fromRow)
    },
  )
}
