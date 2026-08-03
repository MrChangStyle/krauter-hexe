---
name: Verifying a session-bound prod backfill
description: How to confirm an owner-triggered, browser-loop backfill actually completes in production, accounting for replica lag and session-bound progress.
---

# Verifying a session-bound prod backfill

An owner-only backfill that runs as a client loop (batches a few rows per POST, AI-generates
each) only makes progress **while the owner keeps the app tab open**. It is idempotent and
resumes where it left off on the next owner visit, so partial runs are safe but not
self-completing.

**Symptoms of "it stopped, not broke":** coverage climbs a few rows then holds flat; the
deployment logs show the last `backfill` POST some minutes ago with none since; **zero error
logs**. That means the session ended (tab closed), not an AI failure. Have the owner reopen
and leave the tab untouched for a few minutes to finish.

**Why coverage can look stuck even while running:** batches are slow (AI ~10-46s each) AND the
workspace reads a **read-replica** that lags the primary. A flat reading between two quick
checks is often just lag — wait ~60-90s (via `ShellExec sleep`, not `setTimeout`) and re-read
before concluding it stalled. Distinguish the two by checking recent `backfill` POST timestamps
in deployment logs: still arriving = running + lag; silent for minutes = session ended.

**Coverage query that survives the read-replica:** avoid jsonb `FILTER(...)` (the replica rolls
it back). Instead `SELECT id, symptoms::text FROM plants` and count in JS: a row is fully done
only when its text contains every one of the expected keys; `{}` means untouched.

**Why:** at go-live the prod backfill for Kräuter-Hexe took several owner sessions to reach
27/27 because each visit was closed after a few batches; repeated flat readings were replica lag,
not failure.
