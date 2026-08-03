---
name: Session stability rules
description: Why users were repeatedly logged out and the invariants that prevent it.
---

Rules that keep users logged in (the app is session/DB-authorized, not access-token-authorized):

1. **Never clear the server session because an OIDC token refresh failed.** The access token isn't used for API authorization; revoked/deleted users are already locked out by the per-request DB check. A transient provider/network failure during refresh must not force re-login — retry on a later request instead.
2. **Roll both the DB session expiry AND the cookie maxAge on activity** (once per ~24h is enough). A cookie with a fixed lifetime from login day silently logs out even daily-active users.
3. **Client: a failed `/api/auth/user` check is "unknown", not "logged out".** Expose an `isError` flag and keep the cached identity active; only a successful response with `user: null` is a real sign-out. `navigator.onLine` can be true while requests still fail.
4. **User-initiated logout must clear the cached identity BEFORE redirecting to `/api/logout`,** or rule 3 can resurrect a stale "logged in" state after logout.
5. Omitting `prompt: 'login consent'` in the OIDC auth URL makes re-login silent SSO when the provider session still exists — big friction win for a private app.

**Why:** user complained the PWA constantly demanded re-login; causes were refresh-failure→clearSession, non-rolling 7-day cookie, and the client treating fetch errors as logout.
