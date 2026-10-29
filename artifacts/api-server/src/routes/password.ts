/**
 * Passwort vergessen und Passwort ändern (docs/konto.md).
 *
 * With a mail service (lib/mail.ts) the link goes out by mail. Without one the
 * owner gets a push and creates the link in the Verwaltung to pass on by hand
 * – so nobody is locked out before the mail service is set up.
 *
 * The request answers the same whether the address has an account or not, so
 * it cannot be used to find out who uses the app.
 */

import { GetCurrentAuthUserResponse } from '@workspace/api-zod';
import { db, usersTable } from '@workspace/db';
import { eq, sql } from 'drizzle-orm';
import { Router, type IRouter, type Request, type Response } from 'express';

import { publicUserColumns } from '../lib/accounts';
import { setAuthCookie } from '../lib/auth';
import { getAppConfig } from '../lib/appConfig';
import { logger } from '../lib/logger';
import { escapeHtml, isMailConfigured, sendMail } from '../lib/mail';
import { MIN_PASSWORD_LENGTH, hashPassword, verifyPassword } from '../lib/password';
import {
  MAX_MAIL_LINKS_PER_HOUR,
  createResetToken,
  findResetUser,
  recentMailLinks,
  redeemResetToken,
  resetUrl,
} from '../lib/passwordReset';
import { createAuthToken } from '../lib/token';
import { sendPushToUser } from '../lib/webPush';
import { requireOwner } from '../middlewares/requireApproved';

const router: IRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ── Rate limits (in memory, like the login lock-out) ─────────────────────────

const WINDOW_MS = 15 * 60 * 1000;
const hits = new Map<string, number[]>();

/** Counts a hit and says whether the key is still under its limit. */
function allow(key: string, max: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, list] of hits) if (list.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  }
  return true;
}

export function resetRateLimits(): void {
  hits.clear();
}

function passwordError(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`;
  }
  if (password.length > 200) return 'Das Passwort ist zu lang (max. 200 Zeichen).';
  return null;
}

const TOO_MANY = 'Zu viele Versuche. Bitte warte 15 Minuten und versuche es erneut.';
const LINK_INVALID = 'Dieser Link ist abgelaufen oder wurde schon benutzt. Fordere bitte einen neuen an.';

function resetMail(url: string): { subject: string; text: string; html: string } {
  const subject = 'Neues Passwort für Little Farming';
  const text = [
    'Hallo,',
    '',
    'du hast ein neues Passwort für Little Farming angefordert. Über diesen Link legst du es fest:',
    '',
    url,
    '',
    'Der Link gilt eine Stunde und nur einmal. Wenn du nichts angefordert hast, kannst du diese Mail einfach löschen – dein Passwort bleibt, wie es ist.',
    '',
    'Viele Grüße',
    'Little Farming',
  ].join('\n');
  const safe = escapeHtml(url);
  const html = `<p>Hallo,</p>
<p>du hast ein neues Passwort für Little Farming angefordert. Über diesen Knopf legst du es fest:</p>
<p><a href="${safe}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#3f7350;color:#fff;text-decoration:none;font-weight:600">Neues Passwort festlegen</a></p>
<p style="color:#5f6b62;font-size:14px">Der Link gilt eine Stunde und nur einmal. Wenn du nichts angefordert hast, kannst du diese Mail einfach löschen – dein Passwort bleibt, wie es ist.</p>
<p style="color:#5f6b62;font-size:13px">Falls der Knopf nicht geht: ${safe}</p>`;
  return { subject, text, html };
}

async function notifyOwnerOfForgottenPassword(user: { id: string; email: string | null; firstName: string | null }): Promise<void> {
  try {
    const owners = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.isOwner, true));
    const who = user.firstName || user.email || 'Jemand';
    for (const owner of owners) {
      if (owner.id === user.id) continue;
      await sendPushToUser(owner.id, {
        topic: 'admin',
        title: 'Passwort vergessen',
        body: `${who} hat das Passwort vergessen. Schick einen Link aus der Verwaltung (Benutzer → Passwort-Link).`,
        tag: `password-reset-${user.id}`,
        url: '/verwaltung#benutzer',
      });
    }
  } catch (err) {
    logger.warn({ err }, 'password reset push failed');
  }
}

// ── POST /auth/password-reset ─────────────────────────────────────────────────

router.post('/auth/password-reset', async (req: Request, res: Response): Promise<void> => {
  const raw = (req.body as { email?: unknown } | undefined)?.email;
  if (typeof raw !== 'string' || !EMAIL_RE.test(raw.trim()) || raw.length > 200) {
    res.status(400).json({ error: 'Bitte gib eine gültige E-Mail-Adresse ein.' });
    return;
  }
  if (!allow(`ip:${req.ip ?? 'unknown'}`, 10)) {
    res.status(429).json({ error: TOO_MANY });
    return;
  }
  const email = raw.trim().toLowerCase();
  const mail = isMailConfigured();

  const [user] = await db
    .select({ id: usersTable.id, email: usersTable.email, firstName: usersTable.firstName })
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${email}`);

  // Per address at most a few times – silently, the answer stays the same.
  if (user && allow(`email:${email}`, MAX_MAIL_LINKS_PER_HOUR)) {
    if (mail) {
      if ((await recentMailLinks(user.id)) < MAX_MAIL_LINKS_PER_HOUR) {
        const { token } = await createResetToken(user.id, 'mail');
        const sent = await sendMail({ to: email, ...resetMail(resetUrl(getAppConfig().canonicalOrigin!, token)) });
        if (!sent) void notifyOwnerOfForgottenPassword(user);
      }
    } else {
      void notifyOwnerOfForgottenPassword(user);
    }
  }

  res.json({ mail });
});

// ── POST /auth/password-reset/check ───────────────────────────────────────────
// Lets the page say "link expired" before the user types a new password.

router.post('/auth/password-reset/check', async (req: Request, res: Response): Promise<void> => {
  if (!allow(`check:${req.ip ?? 'unknown'}`, 30)) {
    res.status(429).json({ error: TOO_MANY });
    return;
  }
  const token = (req.body as { token?: unknown } | undefined)?.token;
  const userId = typeof token === 'string' ? await findResetUser(token) : null;
  res.json({ valid: !!userId });
});

// ── POST /auth/password-reset/confirm ─────────────────────────────────────────

router.post('/auth/password-reset/confirm', async (req: Request, res: Response): Promise<void> => {
  if (!allow(`confirm:${req.ip ?? 'unknown'}`, 20)) {
    res.status(429).json({ error: TOO_MANY });
    return;
  }
  const { token, password } = (req.body ?? {}) as { token?: unknown; password?: unknown };
  const problem = passwordError(password);
  if (problem) {
    res.status(400).json({ error: problem });
    return;
  }
  if (typeof token !== 'string' || !(await findResetUser(token))) {
    res.status(400).json({ error: LINK_INVALID });
    return;
  }
  const userId = await redeemResetToken(token, await hashPassword(password as string));
  if (!userId) {
    res.status(400).json({ error: LINK_INVALID });
    return;
  }
  const [user] = await db.select(publicUserColumns).from(usersTable).where(eq(usersTable.id, userId));
  setAuthCookie(res, await createAuthToken(userId));
  res.json(GetCurrentAuthUserResponse.parse({ user }));
});

// ── POST /auth/password ───────────────────────────────────────────────────────
// Change the password while signed in. Accounts that only ever used Google
// have none yet and set one without the old one. Other devices are signed out.

router.post('/auth/password', async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }
  const userId = req.user.id;
  if (!allow(`change:${userId}`, 10)) {
    res.status(429).json({ error: TOO_MANY });
    return;
  }
  const { currentPassword, newPassword } = (req.body ?? {}) as { currentPassword?: unknown; newPassword?: unknown };
  const problem = passwordError(newPassword);
  if (problem) {
    res.status(400).json({ error: problem });
    return;
  }
  const [row] = await db.select({ passwordHash: usersTable.passwordHash }).from(usersTable).where(eq(usersTable.id, userId));
  if (row?.passwordHash) {
    const ok = typeof currentPassword === 'string' && currentPassword.length <= 200 && (await verifyPassword(currentPassword, row.passwordHash));
    if (!ok) {
      res.status(400).json({ error: 'Das bisherige Passwort stimmt nicht.' });
      return;
    }
  }
  const now = new Date();
  await db
    .update(usersTable)
    .set({ passwordHash: await hashPassword(newPassword as string), passwordChangedAt: now })
    .where(eq(usersTable.id, userId));
  setAuthCookie(res, await createAuthToken(userId));
  res.json({ ok: true });
});

// ── POST /users/:id/password-reset-link ───────────────────────────────────────
// The owner creates a link for someone who forgot the password, to pass on by
// messenger. It works for 24 hours; the owner never sees or sets the password.

router.post('/users/:id/password-reset-link', requireOwner, async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params['id'] ?? '');
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, id));
  if (!user) {
    res.status(404).json({ error: 'Konto nicht gefunden.' });
    return;
  }
  const origin = getAppConfig().canonicalOrigin ?? `${req.protocol}://${req.get('host') ?? 'localhost'}`;
  const { token, expiresAt } = await createResetToken(user.id, 'owner');
  res.json({ url: resetUrl(origin, token), expiresAt: expiresAt.toISOString() });
});

export default router;
