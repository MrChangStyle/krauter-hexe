/**
 * "Passwort vergessen" (docs/konto.md).
 *
 * A reset link carries a random token; only its SHA-256 is stored. A link
 * works once, and using it voids every other open link of the account. The
 * new password also sets users.password_changed_at, which makes the auth
 * middleware reject every sign-in token issued before – a reset signs out all
 * other devices, in case someone else had got in.
 */

import { createHash, randomBytes } from 'node:crypto';

import { db, passwordResetsTable, usersTable } from '@workspace/db';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';

/** A mailed link is meant to be used right away. */
export const MAIL_LINK_TTL_MS = 60 * 60 * 1000;
/** A link from the owner goes through a messenger and may wait a while. */
export const OWNER_LINK_TTL_MS = 24 * 60 * 60 * 1000;
/** Mailed links per account and hour – stops the inbox being flooded. */
export const MAX_MAIL_LINKS_PER_HOUR = 3;

export const RESET_PATH = '/passwort-neu';

export type ResetVia = 'mail' | 'owner';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function resetUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}${RESET_PATH}?token=${token}`;
}

/** Mailed links this account got in the last hour. */
export async function recentMailLinks(userId: string, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 60 * 60 * 1000);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(passwordResetsTable)
    .where(
      and(
        eq(passwordResetsTable.userId, userId),
        eq(passwordResetsTable.via, 'mail'),
        gt(passwordResetsTable.createdAt, since),
      ),
    );
  return row?.n ?? 0;
}

/** Stores a new link and returns its token (the only time it exists in clear). */
export async function createResetToken(
  userId: string,
  via: ResetVia,
  now = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + (via === 'mail' ? MAIL_LINK_TTL_MS : OWNER_LINK_TTL_MS));
  await db.insert(passwordResetsTable).values({ userId, tokenHash: hashToken(token), via, expiresAt });
  return { token, expiresAt };
}

/** The account a token belongs to while it is still usable, else null. */
export async function findResetUser(token: string, now = new Date()): Promise<string | null> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const [row] = await db
    .select({ userId: passwordResetsTable.userId })
    .from(passwordResetsTable)
    .where(
      and(
        eq(passwordResetsTable.tokenHash, hashToken(token)),
        isNull(passwordResetsTable.usedAt),
        gt(passwordResetsTable.expiresAt, now),
      ),
    );
  return row?.userId ?? null;
}

/**
 * Sets the new password if the token is still usable. Returns the account id,
 * or null when the link is unknown, used or expired. Claiming the token and
 * setting the password happen in one transaction, so a link clicked twice at
 * the same moment changes the password only once.
 */
export async function redeemResetToken(
  token: string,
  passwordHash: string,
  now = new Date(),
): Promise<string | null> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  return db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(passwordResetsTable)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetsTable.tokenHash, hashToken(token)),
          isNull(passwordResetsTable.usedAt),
          gt(passwordResetsTable.expiresAt, now),
        ),
      )
      .returning({ userId: passwordResetsTable.userId });
    if (!claimed) return null;
    const [user] = await tx
      .update(usersTable)
      .set({ passwordHash, passwordChangedAt: now })
      .where(eq(usersTable.id, claimed.userId))
      .returning({ id: usersTable.id });
    if (!user) return null;
    // Every other open link of this account is void now.
    await tx
      .update(passwordResetsTable)
      .set({ usedAt: now })
      .where(and(eq(passwordResetsTable.userId, claimed.userId), isNull(passwordResetsTable.usedAt)));
    return user.id;
  });
}

/** Drops links that ended more than a week ago (called by the daily cleanup). */
export async function pruneResetTokens(now = new Date()): Promise<void> {
  const before = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  await db.delete(passwordResetsTable).where(sql`${passwordResetsTable.expiresAt} < ${before}`);
}

/**
 * Sign-in tokens carry their issue time in whole seconds. A token from the
 * same second as the change still counts, so the fresh token handed out with
 * the change itself is never rejected.
 */
export function tokenPredatesPasswordChange(issuedAtS: number, changedAt: Date | null): boolean {
  if (!changedAt) return false;
  return issuedAtS < Math.floor(changedAt.getTime() / 1000);
}
