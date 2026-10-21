/**
 * Vorschau-Schutz (docs/landingpage.md): while SITE_PASSWORD is set, the whole
 * site – landing page, app and API – answers only with a password page until
 * the visitor has typed that password once. The proof is a cookie holding an
 * HMAC of the password, so changing SITE_PASSWORD locks everyone out again.
 *
 * Machines keep working: the health check, the cron call and the camera
 * webhook bring their own secrets and never see the page.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

import { getJwtSecret } from './token';

export const SITE_COOKIE = 'lf_site';
// Older app versions (from the offline cache) show this text as it is, so it
// says what to do: the page itself asks for the password.
export const SITE_LOCKED_MESSAGE =
  'Diese Seite ist noch nicht öffentlich. Öffne sie im Browser (z. B. Chrome) und gib dort das Seitenpasswort ein.';
const COOKIE_DAYS = 180;
export const GATE_PATH = '/api/site-access';

// Paths a machine calls; they have their own authentication.
const OPEN = [/^\/api\/healthz$/, /^\/api\/cron\//, /^\/api\/webhooks\//, /^\/robots\.txt$/];

const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, number[]>();

export function sitePassword(): string | null {
  const raw = process.env['SITE_PASSWORD']?.trim();
  return raw ? raw : null;
}

function proof(password: string): string {
  return createHmac('sha256', getJwtSecret()).update(`site-gate:${password}`).digest('hex');
}

export function hasAccess(req: Request, password: string): boolean {
  const cookie = (req.cookies as Record<string, string> | undefined)?.[SITE_COOKIE];
  if (typeof cookie !== 'string') return false;
  const want = Buffer.from(proof(password));
  const got = Buffer.from(cookie);
  return got.length === want.length && timingSafeEqual(got, want);
}

function samePassword(typed: string, password: string): boolean {
  // Compare digests so the length of the password does not leak.
  const a = createHmac('sha256', 'cmp').update(typed).digest();
  const b = createHmac('sha256', 'cmp').update(password).digest();
  return timingSafeEqual(a, b);
}

/** Only paths on this site, never "//evil.example" or a full URL. */
export function safeNext(raw: unknown): string {
  return typeof raw === 'string' && /^\/(?!\/)[^\s\\]*$/.test(raw) && !raw.startsWith(GATE_PATH) ? raw : '/';
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function gatePage(next: string, error: string | null): string {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Little Farming</title>
<style>
  :root { color-scheme: light dark; --bg: #f7f6f2; --card: #fff; --fg: #1f2a22; --muted: #5f6b62; --primary: #3f7350; --border: #dcdcd4; --error: #b42318; }
  @media (prefers-color-scheme: dark) { :root { --bg: #141a16; --card: #1d251f; --fg: #eef2ee; --muted: #a3ada5; --primary: #7fb48f; --border: #2e3a31; --error: #f97066; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 16px; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { width: 100%; max-width: 360px; background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 28px 24px; text-align: center; }
  .mark { width: 56px; height: 56px; margin: 0 auto 12px; border-radius: 14px; display: grid; place-items: center; background: color-mix(in srgb, var(--primary) 14%, transparent); color: var(--primary); }
  h1 { margin: 0; font-size: 22px; }
  p { margin: 6px 0 20px; color: var(--muted); font-size: 14px; }
  label { display: block; text-align: left; font-size: 14px; font-weight: 600; margin-bottom: 6px; }
  input { width: 100%; height: 44px; padding: 0 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); color: var(--fg); font-size: 16px; }
  input:focus { outline: 2px solid var(--primary); outline-offset: 1px; }
  button { width: 100%; height: 44px; margin-top: 14px; border: 0; border-radius: 10px; background: var(--primary); color: #fff; font-size: 16px; font-weight: 600; cursor: pointer; }
  .error { color: var(--error); font-size: 14px; margin: 10px 0 0; text-align: left; }
</style>
</head>
<body>
<main>
  <div class="mark" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg></div>
  <h1>Little Farming</h1>
  <p>Diese Seite ist noch nicht öffentlich.</p>
  <form method="post" action="${GATE_PATH}">
    <input type="hidden" name="next" value="${escapeHtml(next)}">
    <label for="pw">Passwort</label>
    <input id="pw" name="password" type="password" autocomplete="current-password" required autofocus>
    ${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ''}
    <button type="submit">Weiter</button>
  </form>
</main>
</body>
</html>`;
}

function sendGate(res: Response, status: number, next: string, error: string | null) {
  res.status(status).set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }).type('html').send(gatePage(next, error));
}

/** GET shows the page, POST checks the password (a plain form, works without JavaScript). */
export function siteGateRoutes(req: Request, res: Response): void {
  const password = sitePassword();
  if (!password) {
    res.redirect(303, safeNext(req.query['next']));
    return;
  }
  if (req.method === 'GET') {
    sendGate(res, 200, safeNext(req.query['next']), null);
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const next = safeNext(body['next']);
  const key = req.ip ?? 'unknown';
  const now = Date.now();
  const recent = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_FAILURES) {
    sendGate(res, 429, next, 'Zu viele Versuche. Bitte warte eine Viertelstunde.');
    return;
  }
  const typed = typeof body['password'] === 'string' ? body['password'] : '';
  if (!samePassword(typed, password)) {
    recent.push(now);
    failures.set(key, recent);
    sendGate(res, 401, next, 'Das Passwort stimmt nicht.');
    return;
  }
  failures.delete(key);
  res.cookie(SITE_COOKIE, proof(password), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: COOKIE_DAYS * 24 * 60 * 60 * 1000 });
  res.redirect(303, next);
}

/** Lets only visitors with the cookie through while SITE_PASSWORD is set. */
export function siteGate(req: Request, res: Response, next: NextFunction): void {
  const password = sitePassword();
  if (!password || req.path === GATE_PATH || OPEN.some((re) => re.test(req.path)) || hasAccess(req, password)) {
    next();
    return;
  }
  if (req.path.startsWith('/api/')) {
    // The app (maybe served by its offline cache) sees this and opens the page.
    res.status(401).set({ 'X-Site-Locked': '1', 'Cache-Control': 'no-store' }).json({ error: SITE_LOCKED_MESSAGE, siteLocked: true });
    return;
  }
  sendGate(res, 401, safeNext(req.originalUrl), null);
}

export function resetSiteGateFailures(): void {
  failures.clear();
}
