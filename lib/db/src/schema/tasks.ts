import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { plantsTable } from "./plants";

export const TASK_ACTION_TYPES = [
  "Gießen",
  "Besprühen",
  "Düngen",
  "Pflanze drehen",
] as const;
export type TaskActionType = (typeof TASK_ACTION_TYPES)[number];

export const TASK_INTERVAL_UNITS = ["Tage", "Wochen", "Monate"] as const;
export type TaskIntervalUnit = (typeof TASK_INTERVAL_UNITS)[number];

export const TASK_FERTILIZER_TYPES = [
  "Biologischer Dünger",
  "Mineralischer Dünger",
  "Manuell",
] as const;
export type TaskFertilizerType = (typeof TASK_FERTILIZER_TYPES)[number];

export const taskActionTypeEnum = pgEnum("task_action_type", TASK_ACTION_TYPES);
export const taskIntervalUnitEnum = pgEnum(
  "task_interval_unit",
  TASK_INTERVAL_UNITS,
);
export const taskFertilizerTypeEnum = pgEnum(
  "task_fertilizer_type",
  TASK_FERTILIZER_TYPES,
);

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  // The authenticated user who owns this task. Text to match usersTable.id.
  userId: text("user_id").notNull(),
  // The plant this task belongs to.
  plantId: integer("plant_id")
    .notNull()
    .references(() => plantsTable.id, { onDelete: "cascade" }),
  // What to do (Gießen, Besprühen, Düngen, Pflanze drehen).
  actionType: taskActionTypeEnum("action_type").notNull(),
  // How often: every <intervalValue> <intervalUnit>.
  intervalValue: integer("interval_value").notNull(),
  intervalUnit: taskIntervalUnitEnum("interval_unit").notNull(),
  // Local time of day for the reminder notification (HH:MM, e.g. "08:00").
  reminderTime: text("reminder_time").notNull(),
  // Whether the task is still active (soft-disable, not used for deletion).
  isActive: boolean("is_active").notNull().default(true),
  // Timestamp of the last time the user marked this task as done.
  lastCompletedAt: timestamp("last_completed_at", { withTimezone: true }),
  // Optional: fertilizer sub-type (only relevant when actionType = "Düngen").
  fertilizerType: taskFertilizerTypeEnum("fertilizer_type"),
  // Optional: custom fertilizer name when fertilizerType = "Manuell".
  fertilizerCustomName: text("fertilizer_custom_name"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Set to the UTC timestamp whenever a push notification is sent for this
  // task. The cron endpoint uses this to prevent sending more than once per
  // Berlin calendar day (replaces the old in-memory sentKeys Set).
  lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
