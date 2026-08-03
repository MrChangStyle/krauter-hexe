---
name: Leaf recount & legacy scan attribution
description: Why leaderboard points must be recomputed from scratch and why old scans live only in scannedByUserId
---

The rule: any leaderboard/points backfill must be an idempotent full **recount** (set, not add) computed from source tables, and plant/insect scan counts must include legacy attribution.

**Why:** Older scans predate the `plant_scans`/`insect_scans` tables — they exist only as `plants.scannedByUserId` / `insects.scannedByUserId` with no scan row, so counting scan tables alone under-counts. Additive backfills double-count users who scanned after per-scan awarding shipped.

**How to apply:** The password-gated `POST /leaderboard/recount-leaves` endpoint first backfills missing scan rows from `scannedByUserId` (onConflictDoNothing), then sets leavesCount = plant scans + insect scans + valid guide days (ints 1–30, deduped) + completed tasks. Safe to rerun. Prod fixes always require republish first (endpoint must exist in the deployed build), then one call with DELETE_PASSWORD.
