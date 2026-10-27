import { boolean, index, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

// Alltagsnotizen (docs/alltagsnotizen.md): a shopping list and things to
// remember, apart from the Hof-Aufgaben. Every person has one list and is its
// owner (user_id). The owner shares it with chosen people (note_shares): they
// see it, tick off and add, but only the owner deletes.
export const NOTE_KINDS = ["einkauf", "merken"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

// The sections of the shopping list, in the order of a walk through the shop.
export const NOTE_CATEGORIES = ["lebensmittel", "getraenke", "drogerie", "haushalt", "tierbedarf", "garten", "sonstiges"] as const;
export type NoteCategory = (typeof NOTE_CATEGORIES)[number];

export const dailyNotesTable = pgTable(
  "daily_notes",
  {
    id: serial("id").primaryKey(),
    // The owner of the list the note is on.
    userId: text("user_id").notNull(),
    // Who wrote it: the owner or someone the list is shared with.
    addedBy: text("added_by"),
    kind: text("kind").$type<NoteKind>().notNull(),
    // Only for the shopping list.
    category: text("category").$type<NoteCategory>(),
    text: text("text").notNull(),
    done: boolean("done").notNull().default(false),
    doneAt: timestamp("done_at", { withTimezone: true }),
    doneBy: text("done_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("daily_notes_user_idx").on(table.userId)],
);

// Who else works on someone's list.
export const noteSharesTable = pgTable(
  "note_shares",
  {
    id: serial("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    // The person the list is shared with.
    userId: text("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("note_shares_owner_user_unique").on(table.ownerId, table.userId), index("note_shares_user_idx").on(table.userId)],
);

export type DailyNote = typeof dailyNotesTable.$inferSelect;
