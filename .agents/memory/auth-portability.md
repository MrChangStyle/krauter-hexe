---
name: Self-hosted email/password auth for a tiny private app
description: The shape of the platform-independent login that replaced provider OIDC, and the traps in migrating existing accounts to it.
---

# Self-hosted auth (small private app)

Stateless token instead of a session store: scrypt (`node:crypto`, no native
build) for password hashing, a short-lived-enough JWT (HS256, `jose`) in an
HttpOnly/Secure/SameSite=Lax cookie, and middleware that **re-reads the user row
on every request**. Because the row is re-read, revocation and approval changes
take effect immediately and no sessions table is needed.

**Why not a session table:** the whole point of the move was portability; a
stateless cookie plus one indexed lookup is cheaper than a session store and has
no cleanup job.

## Migrating existing accounts — the takeover trap

Rows carried over from the old provider have no password. Letting anyone
"claim" such a row by registering with that email address means a **guessed
email address is a full account takeover**, and it inherits whatever the row
already had — approval, admin/owner rights. This is easy to miss because the
claim path looks like a convenience feature.

**How to apply:** gate the claim path behind a shared invitation code and
*refuse it entirely* while no code is configured. Registering a brand-new
address can stay open only if new accounts start with zero privileges and need
explicit approval.

## Small things that are easy to skip

- Unknown email must still spend the hashing time (verify against a throwaway
  hash), or response timing turns login into an account-enumeration oracle.
- Rate-limit **register** as well as login: hashing is deliberately slow, so an
  unthrottled register endpoint is a cheap way to tie up a one-instance server.
- Identical wording for "no such user", "wrong password" and malformed input.
- With no external provider to redirect to, every expired-session UI path must
  call the local logout (drop cached identity → show the login form) instead of
  bouncing to a provider URL.
- Refuse to boot without the signing secret; a default or generated-per-boot
  secret silently logs everyone out on restart.
