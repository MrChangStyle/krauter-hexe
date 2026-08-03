---
name: What breaks when this app leaves Replit
description: The Replit-platform bindings that silently work in the workspace but have no equivalent on a generic host, and how this app was cut loose from them.
---

# Replit-bound dependencies

Most of the stack is portable, but two pieces were bound to the platform in a
way that is invisible while developing on Replit and only fails after a move.
Both have since been removed from this app — keep the reasoning, because any
new Replit-provided building block will have the same property.

## Object storage authenticates through a localhost sidecar

Replit Object Storage is GCS reached through a **sidecar on 127.0.0.1**: the
client uses `external_account` credentials whose token/credential URLs point at
that local endpoint, and signed URLs are minted by calling it too. There is no
service-account key anywhere. Off-platform the endpoint does not exist, so
uploads and image reads fail at runtime — not at build time, and not in any test
that stubs storage.

*Resolution here:* photos now go to an external image CDN; see the image-storage
note. The one-off copy-out script still needs the sidecar, so it must be run
**from inside the repl before cutover**.

## Replit Auth is bound to the repl, not just to OIDC

Login used OIDC against Replit with the repl's own id as `client_id`, and the
allowed redirect URIs belong to that repl's domains. The same code on another
host is rejected at the callback. "We use standard OIDC" does *not* mean
portable.

*Resolution here:* self-hosted email + password with a JWT in an HttpOnly
cookie. See the auth-portability note.

## Single-service host checklist

- Bind to `process.env.PORT` and host `0.0.0.0`.
- One service serving both API and built PWA keeps the cookie same-site and
  avoids CORS entirely; set the client's base path at build time.
- Free tiers sleep after ~15 min idle — anything scheduled must come from an
  external cron pinging an authenticated endpoint, which also wakes the service.
- Grep for platform env vars (`REPL_ID`, `REPLIT_*`) before declaring the move
  done; dev-only plugin gates are fine, runtime reads are not.
