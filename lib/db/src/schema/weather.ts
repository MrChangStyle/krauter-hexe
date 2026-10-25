import { integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { farmsTable } from "./farm";

// Wetter (weather warnings for the animals): one push per farm and day, and
// which warnings went out – a frost that lasts several days is pushed once.
export const weatherDigestLogTable = pgTable(
  "weather_digest_log",
  {
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    kinds: jsonb("kinds").$type<string[]>().notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.farmId, table.day] })],
);

// Other once-a-day pushes per farm (topic "medicines", …): which farm got
// which push on which day.
export const farmPushLogTable = pgTable(
  "farm_push_log",
  {
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    day: text("day").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.farmId, table.topic, table.day] })],
);

// Amtliche DWD-Warnungen: which warning a farm was pushed, keyed by event and
// day – DWD re-issues a warning under a new id when it changes, so a push only
// comes again when the warning gets more severe.
export const weatherAlertLogTable = pgTable(
  "weather_alert_log",
  {
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    // 1 minor … 4 extreme.
    level: integer("level").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.farmId, table.key] })],
);
