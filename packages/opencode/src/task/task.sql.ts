import { sqliteTable, text, index } from "drizzle-orm/sqlite-core"
import { Timestamps } from "@/storage/schema.sql"
import { SessionTable } from "@/session/session.sql"

export const TaskTable = sqliteTable(
  "task",
  {
    id: text().primaryKey(),
    title: text().notNull(),
    description: text().notNull(),
    assignee: text().notNull(),
    status: text().notNull(),
    dependencies: text({ mode: "json" }).notNull().$type<string[]>(),
    acceptance_criteria: text({ mode: "json" }).notNull().$type<string[]>(),
    context_refs: text({ mode: "json" }).notNull().$type<string[]>(),
    session_id: text().references(() => SessionTable.id, { onDelete: "set null" }),
    ...Timestamps,
  },
  (table) => [
    index("task_assignee_idx").on(table.assignee),
    index("task_status_idx").on(table.status),
    index("task_session_idx").on(table.session_id),
  ],
)
