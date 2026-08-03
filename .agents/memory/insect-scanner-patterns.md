---
name: Insect Scanner patterns
description: How the insect scanner feature is wired — DB, API, OpenAPI, frontend — so future changes stay consistent.
---

## DB tables
- `insects` — one row per species; dedup key is `scientific_name` (case-insensitive, same sentinel "Unbekannt" as plants).
- `insect_scans` — one row per (userId, insectId) pair; `onConflictDoNothing` on unique constraint keeps rescans idempotent.
- Enums: `insect_category` (8 values) and `insect_relation_status` (pest/beneficial/neutral).
- Schema files: `lib/db/src/schema/insects.ts` and `lib/db/src/schema/insect-scans.ts` — exported from `lib/db/src/schema/index.ts`.

## API
- Routes in `artifacts/api-server/src/routes/insects.ts`, mounted in `routes/index.ts`.
- Image bytes excluded from JSON (same pattern as plants) — served via `GET /insects/:id/image`.
- `/insects/my-scans` declared **before** `/:id` in the router to prevent "my-scans" being parsed as an integer id.
- AI module: `artifacts/api-server/src/lib/insectIdentification.ts` — same model chain (gemini-flash-lite-latest → gemini-flash-latest), same utility functions pattern as `plantIdentification.ts`.

## OpenAPI / codegen
- Insect schemas: `InsectCategory`, `InsectRelationStatus`, `Insect`, `ScanInsectInput`, `ScanInsectResult`.
- Orval generates: `useScanInsect` (mutation), `useListInsects`, `useListMyInsects`, `useGetInsect`.
- Run `pnpm run codegen` inside `lib/api-spec` after any schema changes, then restart API server.

## Frontend
- Image URL helper: `insectImageUrl(id)` in `lib/image.ts`.
- `InsectCard` component + German label maps (`INSECT_CATEGORY_LABELS`, `INSECT_RELATION_LABELS`) in `components/insect-card.tsx`.
- `InsectScanPage` at `/insekten-scanner` — no offline queue (direct mutation, navigate on success).
- `InsectDetailPage` at `/insekt/:id` — reads from `useListInsects` cache (same offline-first pattern as plants).
- Home page (`users.tsx`) has 4 tabs: Scans / Beet / Insekten / Offline.
- Werkzeug page: Insekten Scanner is now an active card (not "im Aufbau").

**Why:** Consistent with plant scanner patterns throughout; any future insect feature (e.g. archive page, filter by relation status) should follow the same conventions.
