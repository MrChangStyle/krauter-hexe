---
name: Prod deployment has its own database
description: Published Replit apps use a separate production Postgres; how to fix prod data when workspace SQL access is read-only
---
- Replit deployments run against a **separate production database** — rows fixed or backfilled in dev do NOT change the published app. Diagnose prod issues against prod (`executeSql` with `environment: "production"`), which is **read-only** (SELECT only).
- **Why:** a bug "fixed and verified" in dev reappeared in the published app because the prod rows still held the bad data (multi-MB photos); dev verification says nothing about prod data.
- **How to apply:** to mutate prod data, ship a password-gated maintenance endpoint in the app (e.g. PATCH guarded by a secret), have the user republish (publish also applies schema diffs — never hand-write prod migrations), then call that endpoint against the published URL from the workspace. New columns exist in prod only **after** republish, so backfills must wait for it.
- Compensating pattern so old prod rows stay valid before the backfill: new columns get `notNull` + `default ''` and the UI hides empty sections.
- Sequencing: read the prod row list anytime via read-only prod SQL — so backfills of NEW columns/enum values go **after** republish (old deployment can't accept fields it doesn't know). Calling the maintenance endpoint from the workspace still needs deployment visibility set to public (replshield 307s otherwise). The endpoint also accepts `category` for re-bucketing entries into categories added later (e.g. tree/shrub/moss).
