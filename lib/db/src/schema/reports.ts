import { sql } from "drizzle-orm";
import {
  index,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// What can be reported: the shared photo of an archive entry, or a username
// shown in the leaderboard. content_id is the plant/insect id or the user id.
export const REPORT_CONTENT_TYPES = ["plant_image", "insect_image", "username"] as const;
export type ReportContentType = (typeof REPORT_CONTENT_TYPES)[number];

export const REPORT_REASONS = [
  "unangemessen",
  "person",
  "falsch",
  "urheberrecht",
  "spam",
  "sonstiges",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ["open", "resolved", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const reportContentTypeEnum = pgEnum("report_content_type", REPORT_CONTENT_TYPES);
export const reportReasonEnum = pgEnum("report_reason", REPORT_REASONS);
export const reportStatusEnum = pgEnum("report_status", REPORT_STATUSES);

// Created at server start by lib/schemaUpgrade.ts – keep both in sync.
export const reportsTable = pgTable(
  "reports",
  {
    id: serial("id").primaryKey(),
    // Who reported. Named user_id so account deletion covers it (the
    // completeness test in accountDeletion.test.ts checks every user_id).
    userId: text("user_id").notNull(),
    contentType: reportContentTypeEnum("content_type").notNull(),
    contentId: text("content_id").notNull(),
    reason: reportReasonEnum("reason").notNull(),
    note: text("note"),
    status: reportStatusEnum("status").notNull().default("open"),
    // What the owner did: dismiss, remove_image, reset_username, block_user.
    resolution: text("resolution"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    // One open report per person and content – reporting twice adds nothing.
    uniqueIndex("reports_open_unique_idx")
      .on(table.userId, table.contentType, table.contentId)
      .where(sql`${table.status} = 'open'`),
    index("reports_status_idx").on(table.status),
  ],
);

export type Report = typeof reportsTable.$inferSelect;
