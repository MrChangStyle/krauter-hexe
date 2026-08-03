---
name: Backfill ordering & key-presence "done" trap (pflanzenscanner)
description: Adding a new animal/heal-target key touches many enumeration sites and has a subtle backfill ordering dependency.
---

# Adding a new animal / heal-target (e.g. "Pferd"/horse)

The animal list is driven by `ANIMAL_KINDS` in `lib/db/src/schema/plants.ts`
(from which `HEAL_TARGET_KINDS`, `AnimalsMap`, `SymptomsMap` derive). Adding a
key there is the start, but the full end-to-end change also needs, in lockstep:
the OpenAPI spec (`PlantAnimals` + `PlantSymptoms`) **and a client regen**
(`pnpm --filter @workspace/api-spec run codegen`), the AI prompts in
`plantIdentification.ts` (system prompt + animals-backfill + symptoms-backfill),
the benefits map in `routes/plants.ts`, and the frontend `ANIMALS` +
`HEAL_TARGETS` arrays. UI/PDF iterate those arrays, so they need no per-key edits.
No DB migration is needed — `animals`/`symptoms` are jsonb.

**The trap:** the symptom backfill derives each target's tags from that animal's
benefit text (`animals.<kind>.benefits`), and both backfills auto-run for the
owner. Completion is judged by **key presence** (`!symptoms[target]`), not
semantic completeness. So if the symptom backfill runs a row before its animal
fact sheet has the new key, it writes an **empty** tag list, the key is now
present, and the row is marked done forever — the new animal's ailment tags stay
permanently empty even after the animal benefit is later filled.

**Fix pattern (defense in depth):** gate the symptom backfill to start only
after the animal backfill has *finished* (client ordering), AND server-side
defer any row whose per-animal sheets are incomplete (`ANIMAL_KINDS.every(...)`)
so it is never written prematurely and stays eligible for a later pass.

**Why:** a key-presence "done" check turns a transient ordering race into
permanent data corruption; derived-from-derived backfills must respect their
data dependency, not just run in parallel.
