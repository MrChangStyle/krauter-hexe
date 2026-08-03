---
name: Plant identification sentinels
description: AI-missing plant fields are coerced to sentinel defaults; any dedup/grouping/matching on those fields must exclude the sentinels first.
---

The plant-identification step coerces missing/empty AI fields to non-empty **sentinel defaults** instead of null — botanical name → `"Unbekannt"` (exported as `UNKNOWN_BOTANICAL_NAME`), german name → `"Unbekannte Pflanze"`, human/poultry status → `"poisonous"` (safety-first), category → derived.

**Rule:** Any feature that de-duplicates, groups, matches, or joins plants on these fields MUST exclude the sentinel values before matching.

**Why:** Duplicate detection keyed on botanical name would otherwise collapse *every* unidentifiable scan into one archive entry, because they all share `"Unbekannt"`. This was caught in code review, not on the happy path.

**How to apply:** When matching on `botanicalName` (e.g. scan dedup), skip when it equals `UNKNOWN_BOTANICAL_NAME` (case-insensitive). Apply the same caution to the other coerced fields for future grouping/search/analytics features.
