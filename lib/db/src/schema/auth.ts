import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
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
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
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

export type UpsertUser = typeof usersTable.$inferInsert;
export type User = typeof usersTable.$inferSelect;
