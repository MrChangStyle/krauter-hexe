/**
 * Accounts and sign-in.
 *
 * The app keeps its own accounts (email + password) instead of delegating to an
 * external identity provider, so it is not tied to any one hosting platform.
 * The first account that registers becomes the owner and is approved
 * automatically. Everyone else waits until the owner lets them in – unless
 * OPEN_REGISTRATION=true, then new accounts can use the app right away (see
 * lib/registrationPolicy.ts for the brakes that come with that).
 */

import { assignUserCode } from '../lib/userCode';
import { GetCurrentAuthUserResponse } from '@workspace/api-zod';
import { db, usersTable } from '@workspace/db';
import { and, eq, sql, ne } from 'drizzle-orm';
import { Router, type IRouter, type Request, type Response } from 'express';

import { approveIfFreeTesterSlot, notifyOwnerOfNewAccount, promoteFirstOwner, publicUserColumns } from '../lib/accounts';
import { OwnerAccountDeletionError, SubscriptionStillRunningError, deleteAccount } from '../lib/accountDeletion';
import {
  LEGAL_VERSION,
  addressMayRegister,
  dailyCapAllowsRegistration,
  isOpenRegistration,
  recordRegistration,
} from '../lib/registrationPolicy';
import { getTurnstileConfig, verifyTurnstileToken } from '../lib/turnstile';
import { isUsernameAllowed } from '../lib/usernameFilter';
import { clearAuthCookie, setAuthCookie } from '../lib/auth';
import {
  hashPassword,
  spendVerificationTime,
  verifyPassword,
  MIN_PASSWORD_LENGTH,
} from '../lib/password';
import { createAuthToken } from '../lib/token';

const router: IRouter = Router();

// Deliberately permissive: this only catches typos. Without email sending there
// is no way to prove ownership of an address anyway.
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

  // Consent to Datenschutzerklärung and Nutzungsbedingungen is required for
  // every new account; the time and version are stored with it.
  const { acceptTerms, turnstileToken } = req.body as {
    acceptTerms?: unknown;
    turnstileToken?: unknown;
  };
  if (acceptTerms !== true) {
    res.status(400).json({
      error: 'Bitte stimme der Datenschutzerklärung und den Nutzungsbedingungen zu.',
    });
    return;
  }

  const turnstile = getTurnstileConfig();
  if (turnstile && !(await verifyTurnstileToken(turnstile, turnstileToken, req.ip))) {
    recordFailure(key);
    res.status(400).json({
      error: 'Die Sicherheitsprüfung hat nicht geklappt. Bitte versuche es erneut.',
    });
    return;
  }

  const [existing] = await db
    .select({ id: usersTable.id, passwordHash: usersTable.passwordHash })
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${email}`);

  // There is no invitation code: the Seitenpasswort lets testers in, the
  // first FREE_TESTER_SLOTS start at once, the rest wait for the owner.
  // An old account without a password (from the first sign-in) is never
  // taken over by registering – it carries approval and maybe owner rights,
  // and a guessed email address must not be enough for that.
  if (existing && !existing.passwordHash) {
    res.status(403).json({
      error:
        'Für diese E-Mail-Adresse gibt es bereits ein Konto aus der alten Anmeldung. ' +
        'Bitte melde dich beim Betreiber der App (info@littlefarming.de), damit er es für dich freischaltet.',
    });
    return;
  }

  // Brakes for brand-new accounts only; claiming an existing row creates
  // nothing. Checked before the (slow) hashing so a flood costs us little.
  const address = req.ip ?? 'unknown';
  if (!existing) {
    if (!addressMayRegister(address)) {
      res.status(429).json({
        error: 'Von diesem Anschluss wurden gerade zu viele Konten angelegt. Bitte versuche es später erneut.',
      });
      return;
    }
    if (!(await dailyCapAllowsRegistration())) {
      res.status(429).json({
        error: 'Heute können keine weiteren Konten angelegt werden. Bitte versuche es morgen erneut.',
      });
      return;
    }
  }

  const passwordHash = await hashPassword(password);
  const consent = { termsAcceptedAt: new Date(), termsVersion: LEGAL_VERSION };

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
      .set({ passwordHash, ...consent, updatedAt: new Date() })
      .where(eq(usersTable.id, existing.id))
      .returning(publicUserColumns);
  } else {
    try {
      [user] = await db
        .insert(usersTable)
        .values({ email, passwordHash, approved: isOpenRegistration(), ...consent })
        .returning(publicUserColumns);
      recordRegistration(address);
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
  // Testphase: the first testers start without waiting for approval.
  if (!existing && !user.approved) {
    const approved = await approveIfFreeTesterSlot(user.id);
    if (approved) user = approved;
  }
  if (!existing) void notifyOwnerOfNewAccount(user);

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
  // A new account gets its Nutzer-ID on its first look (lib/userCode.ts).
  if (row && row.userCode === null) row.userCode = await assignUserCode(row.id);
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
  if (!isUsernameAllowed(normalized)) {
    res.status(400).json({ error: 'Dieser Benutzername ist nicht erlaubt. Bitte wähle einen anderen.' });
    return;
  }

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

// ── DELETE /auth/user ─────────────────────────────────────────────────────────
// The signed-in user deletes their own account. Proof that it is really them:
// the password, or – for accounts that only ever used Google and have none –
// typing their email address. Wrong attempts count towards the same lock-out
// as logins, so this cannot be used to guess passwords.

router.delete('/auth/user', async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }
  const userId = req.user!.id;
  const key = failureKey(req, `konto-loeschen:${userId}`);

  if (isLockedOut(key)) {
    res.status(429).json({
      error: 'Zu viele Fehlversuche. Bitte warte 15 Minuten und versuche es erneut.',
    });
    return;
  }

  const [row] = await db
    .select({
      email: usersTable.email,
      passwordHash: usersTable.passwordHash,
      isOwner: usersTable.isOwner,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!row) {
    clearAuthCookie(res);
    res.sendStatus(204);
    return;
  }
  if (row.isOwner) {
    res.status(400).json({ error: 'Das Inhaber-Konto kann nicht gelöscht werden.' });
    return;
  }

  const { password, confirmEmail } = (req.body ?? {}) as {
    password?: unknown;
    confirmEmail?: unknown;
  };

  let confirmed: boolean;
  if (row.passwordHash) {
    confirmed =
      typeof password === 'string' &&
      password.length <= 200 &&
      (await verifyPassword(password, row.passwordHash));
  } else {
    confirmed =
      typeof confirmEmail === 'string' &&
      !!row.email &&
      normalizeEmail(confirmEmail) === normalizeEmail(row.email);
  }

  if (!confirmed) {
    recordFailure(key);
    res.status(403).json({
      error: row.passwordHash
        ? 'Das Passwort ist falsch.'
        : 'Die E-Mail-Adresse stimmt nicht mit deinem Konto überein.',
    });
    return;
  }

  try {
    await deleteAccount(userId);
  } catch (err) {
    if (err instanceof OwnerAccountDeletionError) {
      res.status(400).json({ error: 'Das Inhaber-Konto kann nicht gelöscht werden.' });
      return;
    }
    // The paid subscription could not be ended (lib/billing.ts): the account stays.
    if (err instanceof SubscriptionStillRunningError) {
      res.status(502).json({ error: err.message });
      return;
    }
    throw err;
  }

  clearFailures(key);
  clearAuthCookie(res);
  res.sendStatus(204);
});

export default router;
