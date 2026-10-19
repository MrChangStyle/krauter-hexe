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
