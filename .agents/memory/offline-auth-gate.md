---
name: Offline-tolerant auth gate for PWAs
description: Why a network auth check must not block a cold offline boot, and the cache+revalidate pattern that fixes it
---
A PWA whose whole UI sits behind a network auth check (e.g. GET /api/auth/user) is unusable on a **cold offline boot** even though the shell is precached: the check fails offline → the gate shows login/spinner → the user never reaches the offline-capable feature (here: the camera in the forest).

**Why:** the offline scan queue, drain-on-reconnect, and delete-after-upload were all already built and working — but none of it is reachable if the auth gate blocks the app before render when there's no signal. The real gap was the gate, not the capture pipeline.

**How to apply (the pattern used):**
- Cache the last **approved** identity in localStorage; never cache a not-approved or signed-out user, so the offline fallback can't grant access it shouldn't.
- Serve the cached identity only when the live check has no user AND (`navigator` is offline OR a revalidate is in flight). Online, the server's answer always wins.
- A live server answer of `user=null` **while online** = genuine sign-out → clear the cache. `user=null` while offline = network failure → keep it.
- On the `online` event, call a `revalidate()` on the auth hook and keep serving the cached user until it resolves, or the user gets bounced to the login screen mid-session (and the queue won't auto-drain until the gate re-opens).
- localStorage is client-tamperable, so this only forges **offline UI** access on that one device; every API call is still enforced server-side. That's an acceptable boundary.

**Gotcha:** if the auth hook lives in a shared `composite` TS project, rebuild that project after editing it or consumers typecheck against the stale `dist/*.d.ts`. Keeping the hook inside the app package avoids the whole class of problem.

**Gotcha:** with self-hosted login there is no provider URL to bounce to — every "session expired" path must call the local logout (which drops the cached identity) so the gate falls back to the login form instead of a dead redirect.
