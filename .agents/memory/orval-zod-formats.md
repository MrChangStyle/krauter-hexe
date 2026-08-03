---
name: Orval zod client vs OpenAPI string formats
description: Which OpenAPI format annotations break codegen typecheck in this repo (orval emits zod-v4 API against zod 3 main entry)
---

The rule: in `lib/api-spec/openapi.yaml`, do NOT use `format: email` or `format: uri` on string schemas. `format: date-time` is fine.

**Why:** orval (v8.x) generates zod-v4-style top-level validators for these formats (`zod.email()`, `zod.url()`), but the repo pins zod 3.x whose main entry has no such top-level functions — `typecheck:libs` (part of the codegen script) fails with `Property 'email'/'url' does not exist on typeof zod`. The generation step itself succeeds, so downstream packages then see stale/partial declaration files and report confusing "no exported member" errors in unrelated symbols.

**How to apply:** when adding spec schemas/parameters, express email/URL fields as plain `type: string` (validation value is negligible — responses are `.parse()`d on rows we produce ourselves). If a codegen typecheck failure names a zod method that looks like zod-v4 API, grep the spec for the corresponding `format:` annotation and remove it, then re-run codegen so declarations regenerate.
