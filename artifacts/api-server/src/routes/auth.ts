/**
 * Accounts and sign-in.
 *
 * The app keeps its own accounts (email + password) instead of delegating to an
 * external identity provider, so it is not tied to any one hosting platform.
 * Access stays private: the first account that registers becomes the owner and
 * is approved automatically, everyone else waits until the owner lets them in.
 */

import { GetCurrentAuthUserResponse } from '@workspace/api-zod';
import { db, usersTable } from '@workspace/db';
import { and, eq, sql, ne } from 'drizzle-orm';
import { Router, type IRouter, type Request, type Response } from 'express';

import { promoteFirstOwner, publicUserColumns } from '../lib/accounts';
import { clearAuthCookie, setAuthCookie } from '../lib/auth';
import {
  hashPassword,
  spendVerificationTime,
  verifyPassword,
  MIN_PASSWORD_LENGTH,
} from '../lib/password';
import { createAuthToken } from '../lib/token';

const router: IRouter = Router();

// Deliberately permissive: this only catches typos, the real check is that the
// owner has to approve the account before it can do anything.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

// ── Brute-force protection ────────────────────────────────────────────────────
// A handful of family accounts on a public URL: without a lock-out, a script
// could try passwords indefinitely. Counting in memory is enough here – a
// restart clearing the counters is not a meaningful weakening.

const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map<string, { count: number; firstAt: number }>();

function pruneFailures(now: number): void {
  for (const [key, entry] of failures) {
    if (now - entry.firstAt > FAILURE_WINDOW_MS) failures.delete(key);
  }
}

function failureKey(req: Request, email: string): string {
  return `${req.ip ?? 'unknown'}|${email}`;
}

function isLockedOut(key: string): boolean {
  const entry = failures.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > FAILURE_WINDOW_MS) {
    failures.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

function recordFailure(key: string): void {
  const now = Date.now();
  pruneFailures(now);
  const entry = failures.get(key);
  if (!entry || now - entry.firstAt > FAILURE_WINDOW_MS) {
    failures.set(key, { count: 1, firstAt: now });
    return;
  }
  entry.count += 1;
}

function clearFailures(key: string): void {
  failures.delete(key);
}

// ── Credential validation ─────────────────────────────────────────────────────

type Credentials = { email: string; password: string };

function parseCredentials(
  body: unknown,
): { ok: true; data: Credentials } | { ok: false; error: string } {
  const { email, password } = (body ?? {}) as {
    email?: unknown;
    password?: unknown;
  };

  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return { ok: false, error: 'Bitte gib eine gültige E-Mail-Adresse ein.' };
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`,
    };
  }
  // Guard against absurdly long inputs: hashing is intentionally slow, so an
  // unbounded password is a cheap way to tie up the server.
  if (password.length > 200) {
    return { ok: false, error: 'Das Passwort ist zu lang (max. 200 Zeichen).' };
  }

  return { ok: true, data: { email: normalizeEmail(email), password } };
}

async function signIn(res: Response, userId: string): Promise<void> {
  setAuthCookie(res, await createAuthToken(userId));
}

// ── POST /auth/register ───────────────────────────────────────────────────────
// Creates an account, or claims an existing one that has no password yet.
// Claiming matters for the accounts that already existed before the switch away
// from the external login: it keeps their id, and with it their scans, leaves
// and approval status.

router.post('/auth/register', async (req: Request, res: Response): Promise<void> => {
  const parsed = parseCredentials(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const { email, password } = parsed.data;
  const key = failureKey(req, email);

  // Registering also hashes a password, which is deliberately slow – so the
  // same lock-out as for login keeps this endpoint from being used to tie up
  // the server or to hammer the invitation code.
  if (isLockedOut(key)) {
    res.status(429).json({
      error: 'Zu viele Versuche. Bitte warte 15 Minuten und versuche es erneut.',
    });
    return;
  }

  // Shared invitation code. Without it, anyone who guesses a family member's
  // email address could claim their account before they register themselves.
  const requiredCode = process.env['REGISTRATION_CODE'];
  if (requiredCode) {
    const { registrationCode } = req.body as { registrationCode?: unknown };
    if (registrationCode !== requiredCode) {
      recordFailure(key);
      res.status(403).json({ error: 'Der Einladungscode stimmt nicht.' });
      return;
    }
  }

  const [existing] = await db
    .select({ id: usersTable.id, passwordHash: usersTable.passwordHash })
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${email}`);

  // Claiming a pre-existing, password-less account inherits everything that
  // row already has – including approval and, for one of them, owner rights.
  // Proving knowledge of the invitation code is the only thing standing
  // between a guessed email address and that takeover, so this path is refused
  // outright while no code is configured.
  if (existing && !existing.passwordHash && !requiredCode) {
    res.status(403).json({
      error:
        'Für diese E-Mail-Adresse gibt es bereits ein Konto aus der alten Anmeldung. ' +
        'Zum Übernehmen wird ein Einladungscode benötigt – bitte beim Besitzer der App melden.',
    });
    return;
  }

  const passwordHash = await hashPassword(password);

  let user;
  if (existing) {
    if (existing.passwordHash) {
      res.status(409).json({
        error: 'Für diese E-Mail-Adresse gibt es bereits ein Konto. Bitte melde dich an.',
      });
      return;
    }
    // Account from before the switch: attach a password, keep everything else.
    [user] = await db
      .update(usersTable)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(usersTable.id, existing.id))
      .returning(publicUserColumns);
  } else {
    try {
      [user] = await db
        .insert(usersTable)
        .values({ email, passwordHash })
        .returning(publicUserColumns);
    } catch (err) {
      const code =
        (err as { code?: string })?.code ??
        (err as { cause?: { code?: string } })?.cause?.code;
      if (code === '23505') {
        res.status(409).json({
          error: 'Für diese E-Mail-Adresse gibt es bereits ein Konto. Bitte melde dich an.',
        });
        return;
      }
      throw err;
    }
  }

  if (!user.isOwner) {
    const promoted = await promoteFirstOwner(user.id);
    if (promoted) user = promoted;
  }

  await signIn(res, user.id);
  res.status(201).json(GetCurrentAuthUserResponse.parse({ user }));
});

// ── POST /auth/login ──────────────────────────────────────────────────────────

router.post('/auth/login', async (req: Request, res: Response): Promise<void> => {
  const parsed = parseCredentials(req.body);
  if (!parsed.ok) {
    // Same wording as a wrong password: a specific message here would tell an
    // attacker which half of the input was the problem.
    res.status(401).json({ error: 'E-Mail-Adresse oder Passwort ist falsch.' });
    return;
  }
  const { email, password } = parsed.data;
  const key = failureKey(req, email);

  if (isLockedOut(key)) {
    res.status(429).json({
      error: 'Zu viele Fehlversuche. Bitte warte 15 Minuten und versuche es erneut.',
    });
    return;
  }

  const [row] = await db
    .select({
      id: usersTable.id,
      passwordHash: usersTable.passwordHash,
    })
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${email}`);

  // Unknown email: still spend the time a real verification costs, otherwise
  // the response time alone reveals which addresses have an account.
  const valid = row?.passwordHash
    ? await verifyPassword(password, row.passwordHash)
    : (await spendVerificationTime(password), false);

  if (!row || !valid) {
    recordFailure(key);
    res.status(401).json({ error: 'E-Mail-Adresse oder Passwort ist falsch.' });
    return;
  }

  clearFailures(key);

  const [user] = await db
    .select(publicUserColumns)
    .from(usersTable)
    .where(eq(usersTable.id, row.id));

  await signIn(res, user.id);
  res.json(GetCurrentAuthUserResponse.parse({ user }));
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────

router.post('/auth/logout', async (_req: Request, res: Response): Promise<void> => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

// ── GET /auth/user ────────────────────────────────────────────────────────────

router.get('/auth/user', async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.json(GetCurrentAuthUserResponse.parse({ user: null }));
    return;
  }
  // Re-read from DB so username / leavesCount are always fresh.
  const [row] = await db
    .select(publicUserColumns)
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.id));
  res.json(GetCurrentAuthUserResponse.parse({ user: row ?? null }));
});

// ── PATCH /auth/user ──────────────────────────────────────────────────────────
// Lets the current user choose their leaderboard username (1–8 letters, A-Z only).
router.patch('/auth/user', async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }
  const { username } = req.body as { username?: unknown };
  if (
    typeof username !== 'string' ||
    !/^[A-Za-z]{1,8}$/.test(username)
  ) {
    res
      .status(400)
      .json({ error: 'Benutzername: 1–8 Buchstaben (A–Z), keine Zahlen oder Sonderzeichen.' });
    return;
  }
  const normalized = username.toUpperCase();

  // Case-insensitive uniqueness check (excluding self).
  const [conflict] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        sql`upper(${usersTable.username}) = ${normalized}`,
        ne(usersTable.id, req.user!.id),
      ),
    );
  if (conflict) {
    res.status(409).json({ error: 'Dieser Benutzername ist bereits vergeben.' });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ username: normalized })
    .where(eq(usersTable.id, req.user!.id))
    .returning(publicUserColumns);

  res.json({ user: updated });
});

export default router;
