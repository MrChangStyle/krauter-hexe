import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { plantsTable } from "./plants";

export const CARE_GUIDE_STATUSES = ["Aktiv", "Abgeschlossen"] as const;
export type CareGuideStatus = (typeof CARE_GUIDE_STATUSES)[number];

export const careGuideStatusEnum = pgEnum("care_guide_status", CARE_GUIDE_STATUSES);

export const careGuidesTable = pgTable("care_guides", {
  id: serial("id").primaryKey(),
  // The authenticated user who owns this guide.
  userId: text("user_id").notNull(),
  // Optional reference to a saved plant in the archive.
  plantId: integer("plant_id").references(() => plantsTable.id, { onDelete: "set null" }),
  // The plant name as returned by the health analysis (denormalised for display
  // even when plantId is null or the plant has been deleted).
  plantName: text("plant_name").notNull(),
  // Optimal humidity range as a short German string, e.g. "60–70 %".
  targetHumidity: text("target_humidity").notNull().default(""),
  // Start date of the 30-day programme.
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  // End date (startDate + 30 days).
  endDate: timestamp("end_date", { withTimezone: true }).notNull(),
  // Current status of the guide.
  status: careGuideStatusEnum("status").notNull().default("Aktiv"),
  // 30-entry JSON array stored as text (serialised CareGuideDailyEntry[]).
  dailyPlan: text("daily_plan").notNull(),
  // The day-1 photo (base64 data URL from the Pflanzendoc scan).
  imageDay1: text("image_day_1"),
  // The day-30 follow-up photo (base64 data URL; set by the user at day 30).
  imageDay30: text("image_day_30"),
  // Pot-size assessment: e.g. "Aktueller Topf ist ausreichend" or "Umtopfen empfohlen: Topf zu klein"
  potSizeRecommendation: text("pot_size_recommendation"),
  // Recommended minimum pot diameter in cm when repotting is needed (e.g. "25 cm").
  recommendedPotDiameter: text("recommended_pot_diameter"),
  // Recommended soil type for this plant (e.g. "Zimmerpflanzenerde mit Perlit").
  recommendedSoilType: text("recommended_soil_type"),
  // Whether the user has enabled daily reminders for this guide.
  reminderEnabled: boolean("reminder_enabled").notNull().default(false),
  // Time of day for the reminder in HH:MM format (e.g. "09:00").
  reminderTime: text("reminder_time").notNull().default("09:00"),
  // JSON array of day numbers (1–30) the user has marked as completed (e.g. "[1,2,3]").
  completedDays: text("completed_days").notNull().default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Set to the UTC timestamp whenever a push notification is sent for this
  // guide. The cron endpoint uses this to prevent sending more than once per
  // Berlin calendar day (replaces the old in-memory sentKeys Set).
  lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
});

export type CareGuide = typeof careGuidesTable.$inferSelect;
export type InsertCareGuide = typeof careGuidesTable.$inferInsert;
