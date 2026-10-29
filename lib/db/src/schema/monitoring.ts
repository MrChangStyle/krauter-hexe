import { date, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

// Betrieb (error monitoring, status notice, usage counts). Deliberately
// sparing: no user, no IP, no request body is stored – only what helps to find
// a bug, and daily totals.

// One row per kind of error (same source, message and place), counted up.
export const errorGroupsTable = pgTable("error_groups", {
  fingerprint: text("fingerprint").primaryKey(),
  source: text("source").notNull(), // "server" | "client"
  message: text("message").notNull(),
  location: text("location"),
  stack: text("stack"),
  release: text("release"),
  count: integer("count").notNull().default(1),
  firstSeen: timestamp("first_seen", { withTimezone: true }).notNull().defaultNow(),
  lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
  // Set by the owner; a new occurrence opens the group again.
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
});

// The notice shown to everyone during a disruption (one row, id 1).
export const appStatusTable = pgTable("app_status", {
  id: integer("id").primaryKey(),
  message: text("message"),
  level: text("level").notNull().default("info"), // "info" | "warning"
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Daily totals (Berlin day): active users, AI actions, errors.
export const usageDailyTable = pgTable(
  "usage_daily",
  {
    day: date("day", { mode: "string" }).notNull(),
    metric: text("metric").notNull(),
    value: integer("value").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.day, table.metric] })],
);

// Besucher der Homepage (docs/analyse.md): page views per day, page and
// origin (a campaign name or the referring domain). No IP, no cookie, no
// person – only these three keys and a count.
export const siteVisitsTable = pgTable(
  "site_visits",
  {
    day: date("day", { mode: "string" }).notNull(),
    path: text("path").notNull(),
    source: text("source").notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.day, table.path, table.source] })],
);
