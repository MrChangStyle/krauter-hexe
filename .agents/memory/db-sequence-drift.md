---
name: Sequence drift after a data migration
description: Copying rows with explicit ids leaves identity/serial counters behind, so every later INSERT dies on a duplicate primary key — how to spot it and repair it.
---

# Sequence drift breaks *all* inserts, silently

When rows are copied into a Postgres database with their **explicit ids** (a data
migration, a restore, a copy from an older database), the owning
identity/serial sequence is **not** advanced. The counter still points at a low
number, so the next `INSERT` is handed an id that already exists and fails with:

```
duplicate key value violates unique constraint "<table>_pkey"
Key (id)=(N) already exists.
```

This does not degrade gracefully: **every** insert into that table fails,
forever, until the counter passes `max(id)`. A retry loop will retry a
permanently doomed write (and re-upload its image each time).

**Why this is hard to see:** drizzle wraps the driver error, so the app log shows
only `Failed query: insert into "plants" (...) params: ...` — the actual
Postgres cause (`23505`, constraint name, `Key (id)=(N)`) is *not* in that
message. Chasing the wrapper leads to false theories (missing column, enum
mismatch, unique index on a business key).

**How to diagnose:** replay the exact failing statement outside the app against
the same connection string, inside `BEGIN … ROLLBACK`, and print
`err.code / message / detail / constraint`. The real cause appears immediately.
This is faster and safer than adding logging and redeploying.

**How to repair:** for every sequence, compare the id it would hand out next
against `max(id)` in the owning table, then
`setval(seq, max(id), true)` for the ones that are behind. Compute "next id"
correctly: with `is_called = false`, `nextval()` returns `last_value` itself, not
`last_value + 1` — otherwise healthy sequences look broken. Never move a
sequence backwards.

**Check the whole database, not the one table you noticed.** Drift comes from a
migration, and a migration touches many tables at once. In practice a single
migration left 7 of 10 sequences broken while the symptom only surfaced on the
most-used table.

**Which database?** `NEON_DATABASE_URL` takes priority over `DATABASE_URL` in
this project's db package, so the workspace SQL tool (which targets the
Replit-managed database) inspects a **different, stale** database than the app
uses. Schema conclusions drawn from it are worthless — a column that "does not
exist" there may exist in the real one. Always confirm the host you are querying
before believing a schema finding.
