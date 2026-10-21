import { boolean, index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Feedback (docs/feedback.md): improvement ideas testers send the owner from
// the speech bubble in the app, typed or dictated. Personal, goes with the
// account.
export const feedbackTable = pgTable(
  "feedback",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    text: text("text").notNull(),
    // The page it was sent from, e.g. "/farm/futter".
    page: text("page"),
    // Dictated with the microphone (speech recognition can mishear).
    voice: boolean("voice").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [index("feedback_created_idx").on(table.createdAt)],
);
