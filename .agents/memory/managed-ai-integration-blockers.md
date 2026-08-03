---
name: Managed AI integration blockers
description: What to do when Replit's managed OpenAI/Anthropic integrations are unavailable for a project.
---

Both the managed OpenAI and Anthropic integrations can return `awaiting_account_upgrade` status, blocking use entirely until the user upgrades their Replit account/plan.

**Why:** this is an account-level gate, not something fixable from within a single project session.

**How to apply:** if the user declines to upgrade, ask whether they have their own API key for any supported provider (OpenAI, Anthropic, Gemini, etc.) via the secrets flow (never accept a pasted raw key in chat). If they provide one, wire the backend to call that provider's SDK directly with the key from `process.env`, rather than through the Replit AI Integrations proxy. Document this deviation in `replit.md` under Architecture decisions so future sessions understand why the proxy pattern isn't used.
