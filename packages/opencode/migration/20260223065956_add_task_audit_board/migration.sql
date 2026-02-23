CREATE TABLE `audit_event` (
	`id` text PRIMARY KEY,
	`task_id` text,
	`session_id` text NOT NULL,
	`source_part_id` text,
	`source_call_id` text,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_audit_event_task_id_task_id_fk` FOREIGN KEY (`task_id`) REFERENCES `task`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_audit_event_session_id_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `task` (
	`id` text PRIMARY KEY,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`assignee` text NOT NULL,
	`status` text NOT NULL,
	`dependencies` text NOT NULL,
	`acceptance_criteria` text NOT NULL,
	`context_refs` text NOT NULL,
	`session_id` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	CONSTRAINT `fk_task_session_id_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `audit_event_task_idx` ON `audit_event` (`task_id`);--> statement-breakpoint
CREATE INDEX `audit_event_session_idx` ON `audit_event` (`session_id`);--> statement-breakpoint
CREATE INDEX `audit_event_part_idx` ON `audit_event` (`source_part_id`);--> statement-breakpoint
CREATE INDEX `audit_event_created_idx` ON `audit_event` (`created_at`);--> statement-breakpoint
CREATE INDEX `task_assignee_idx` ON `task` (`assignee`);--> statement-breakpoint
CREATE INDEX `task_status_idx` ON `task` (`status`);--> statement-breakpoint
CREATE INDEX `task_session_idx` ON `task` (`session_id`);