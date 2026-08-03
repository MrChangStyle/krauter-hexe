---
name: Scan quota vs. automatic queue retries
description: Why a per-day scan cap and an auto-retrying offline queue poison each other, and the rules that keep them compatible.
---

# Scan quota vs. automatic queue retries

A per-user daily scan cap and a client queue that retries failures automatically
are a dangerous pair. Two independent rules keep them compatible.

## Rule 1 — an attempt that produced no result must be refunded

The quota row is written *before* the AI call (that ordering is deliberate: it is
what makes the check-and-record atomic, so concurrent requests cannot overshoot
the cap). The consequence is that a failed AI call still consumes quota.

Combined with automatic client retries this escalates badly: one client-side bug
that makes every request fail burns `retries × photos` quota units in seconds and
locks the user out for the rest of the day.

**Refund on failure paths where no identification was returned. Do NOT refund
when the AI answered successfully but the answer was a rejection** (e.g. "this
photo contains no plant") — the resource really was consumed, and the client does
not auto-retry that path anyway.

**Refund by the primary key of the row this request inserted**, never by
"the newest attempt for this user today". Under concurrent scans the newest row
may belong to a *different, successful* request, so a failing request would
cancel out someone else's attempt and grant itself a free extra one. Return the
inserted row id from the check-and-record function for this purpose.

**Why:** a client bug that made every scan fail exhausted a 15/day cap almost
instantly, and the resulting rate-limit state then blocked the queue silently
(see rule 2). Refunding made the failure self-healing instead of self-amplifying.

**How to apply:** whenever a rate-limited endpoint records its attempt before
doing the expensive work, every early-return failure path below the recording
point needs a refund decision.

## Rule 2 — a gate that pauses the queue must be visible in the UI

Client-side pause gates (quota exhausted, session expired, backoff) are the right
way to stop hammering a server. But queued items keep their neutral "waiting"
status while a gate is active, so the queue screen happily claims the photos will
be processed automatically while nothing whatsoever is happening. Users read that
as "the app is broken and loses my photos".

Any gate that suppresses draining must be surfaced: expose it through the queue
context, render a banner naming the reason and (for a quota) the reset time, and
suppress the "scan now" button that would silently do nothing.

**Why:** the visible symptom of an invisible gate is indistinguishable from a
hung queue, which sends debugging in completely the wrong direction.

**How to apply:** adding any new early-return to the drain entry point means
adding a matching piece of UI state.

## Rule 3 — exhausted items need an unattended second chance

Capping automatic attempts stops a broken photo from looping forever, but leaving
exhausted items retryable only by hand means a transient outage (cold start,
expired session, exhausted quota) strands them permanently — the user must find
the queue screen and press a button per item.

Give exhausted items a watchdog that revives them after a long back-off, with a
**capped number of revival rounds** so a genuinely broken item still stops. Only
revive failures classified as transient; a permanent 4xx will fail identically no
matter how long you wait, and retrying it just burns quota.

A manual retry should reset both the attempt counter and the revival counter, and
clear every gate — an explicit user action outranks the queue's own heuristics.
Offer that manual retry for *waiting* items too, not just failed ones: when a
gate has stalled the queue, "waiting" is exactly the state a user wants to kick.

## Rule 4 — the retry brake must also live on the server, and be scoped

Client-side attempt caps and back-off are necessary but not sufficient: an
installed PWA can keep running an old cached bundle for days, so the only brake
that is guaranteed to apply to *every* client is one on the server. This matters
whenever the expensive work (a paid AI call, an upload) happens before the write
that fails — every retry then costs money for a result that cannot succeed.

Three properties the server brake needs:

- **Two levels.** A per-photo counter (this one photo keeps failing → refuse it
  with a **4xx**, which the client treats as permanent and stops auto-retrying)
  plus a windowed global counter (the backend itself is broken → refuse everything
  briefly with a **5xx**, which stays auto-retryable). Getting the status class
  wrong inverts the intent: a 4xx on a transient outage strands every queued
  photo, a 5xx on a hopeless photo keeps it looping.
- **Scoped per failure domain.** Independent endpoints fail independently, so a
  success on one must not lift another's pause — otherwise unrelated traffic
  silently cancels the brake exactly when it is needed.
- **Checked before the quota and before the expensive call**, so a refused
  attempt costs neither quota nor money. After tripping, start a fresh window,
  or the brake re-trips on the first request after the pause ends.

**Aborted connections are a separate category.** Phones hang up on scan requests
routinely (tab reload after the camera, dropped mobile connection), and the
server still pays for the AI call — so aborts must be bounded too. But they are
not evidence that the backend is broken: count them **per photo only, never
globally**, with a more generous allowance and a short pause, and answer with a
retryable status. Counting aborts globally would let normal mobile behaviour
pause scanning for everyone.

**Why:** a stale identity sequence made every insert fail; because failures are
refunded (rule 1) the quota was no longer a natural brake, and each queued photo
kept buying AI calls on a 5-second drain interval with no back-off.

**How to apply:** any endpoint that spends money before it can fail needs this,
and the client's classification of 4xx vs 5xx has to be checked against the codes
the brake returns — including that a *different* 4xx code on the same route may
mean "delete this queued item", which must never be triggered by the brake.
