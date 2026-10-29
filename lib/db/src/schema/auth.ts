import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

// Left over from the previous Replit Auth integration, which kept sessions in
// the database. Sign-in now uses a signed token in a cookie, so nothing writes
// here any more. The table is kept (not dropped) so an older build of the app
// that is still deployed somewhere keeps working until it is replaced.
export const sessionsTable = pgTable(
  'sessions',
  {
    sid: varchar('sid').primaryKey(),
    sess: jsonb('sess').notNull(),
    expire: timestamp('expire').notNull(),
  },
  (table) => [index('IDX_session_expire').on(table.expire)],
);

// Private-access model: the first account that ever registers becomes the
// owner (auto-approved). Everyone else starts unapproved and only gets in
// after the owner grants access inside the app.
export const usersTable = pgTable(
  'users',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    email: varchar('email').unique(),
    // scrypt hash of the account password; null for accounts created before
    // the switch away from Replit Auth, which have not set one yet.
    passwordHash: text('password_hash'),
    firstName: varchar('first_name'),
    lastName: varchar('last_name'),
    profileImageUrl: varchar('profile_image_url'),
    approved: boolean('approved').notNull().default(false),
    isOwner: boolean('is_owner').notNull().default(false),
    username: varchar('username', { length: 8 }).unique(),
    leavesCount: integer('leaves_count').notNull().default(0),
    // When and to which version of Datenschutzerklärung/Nutzungsbedingungen
    // the account agreed. Null for accounts from before public registration.
    termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
    termsVersion: varchar('terms_version'),
    // Set when the owner blocks the account through moderation (approved is
    // set to false at the same time). Lets the app say "gesperrt" instead of
    // "warte auf Freigabe". Cleared when the owner approves the account again.
    blockedAt: timestamp('blocked_at', { withTimezone: true }),
    // Last password change. Sign-in tokens issued before it are no longer
    // accepted, so a reset signs out every other device.
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    // Day of the last request (Berlin), only for the daily count of active
    // users in the owner's usage statistics – no further activity is stored.
    lastActiveOn: date('last_active_on', { mode: 'string' }),
  },
  (table) => [
    // Hard guarantee that there is at most ONE owner row, no matter how
    // requests interleave: the partial unique index only contains rows with
    // is_owner = true, so a second promotion fails at the database level.
    uniqueIndex('users_single_owner_idx')
      .on(table.isOwner)
      .where(sql`${table.isOwner} = true`),
  ],
);

// One-time links for "Passwort vergessen" (docs/konto.md). Only the SHA-256 of
// the token is stored, so a leaked database does not hand out working links.
// A link works once and for a limited time; `via` says whether it went out by
// mail or the owner created it to pass on by hand.
export const passwordResetsTable = pgTable(
  'password_resets',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    via: text('via').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('password_resets_user_idx').on(table.userId)],
);

export type UpsertUser = typeof usersTable.$inferInsert;
export type User = typeof usersTable.$inferSelect;
