import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { SessionTable } from "@/session/session.sql"
import { TaskTable } from "./task.sql"

export const AuditEventTable = sqliteTable(
  "audit_event",
  {
    id: text().primaryKey(),
    task_id: text().references(() => TaskTable.id, { onDelete: "set null" }),
    session_id: text()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    source_part_id: text(),
    source_call_id: text(),
    type: text().notNull(),
    payload: text({ mode: "json" }).notNull().$type<Record<string, unknown>>(),
    created_at: integer().notNull(),
  },
  (table) => [
    index("audit_event_task_idx").on(table.task_id),
    index("audit_event_session_idx").on(table.session_id),
    index("audit_event_part_idx").on(table.source_part_id),
    index("audit_event_created_idx").on(table.created_at),
  ],
)
