---
name: Mushroom two-photo safety gate
description: How "essbar" for Pilze is enforced (write-time + read-time gate); side-image presence is the durable verification marker.
---
- Rule: a mushroom is only served as edible when a side photo (image_data_side) is stored AND the scan-time AI flag confirmed a confident, lookalike-safe ID (missing flag = not confident, per the sentinel rule).
- Enforcement is layered: identification downgrades at write time (German warning prefix in edibilityDetails); the API's shared plant selection applies a SQL CASE backstop at read time (humanStatus + edibilityDetails + category tab counts), so legacy rows and password-gated maintenance PATCHes can never surface an unverified edible mushroom.
- Stored rows are deliberately NOT mutated by the gate; a two-photo rescan upgrades an entry via the dedup-update path (matched by botanicalName, only when the existing row has no side image - never the reverse, so a later 1-photo scan can't downgrade a verified entry).

**Why:** food-safety invariant must hold globally, not just for new scans; code review caught PATCH category re-bucketing and legacy single-photo rows as bypasses of a scan-time-only gate. Read-time enforcement also fixes prod automatically on publish (prod DB is read-only from the workspace).

**How to apply:** any new read path or report over plants must go through the shared plant selection (or replicate the CASE); any new write path must run the identification gate or preserve the invariant; treat image_data_side presence as the only verification provenance - nothing else marks an entry as "two-photo verified".
