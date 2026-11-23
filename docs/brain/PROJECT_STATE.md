# Akram Brain — persistent project state

Single source of truth for decisions, requirements, progress, known issues, test evidence and next actions.
Update at the end of every working session (newest first).

## Decisions (current)
| # | Decision | Why | Date |
|---|---|---|---|
| D1 | Akram Brain's Paradigm workspace is built **inside PARADIGM EVENTOPS**, not as a new app | EventOps already has auth, RBAC, tenant isolation, audit, approvals, deterministic engines, typed-tool AI, document extraction, EN/AR, Docker + encrypted backups (112 unit / 96 integration tests reproduced 2026-11-24) | 2026-11-24 |
| D2 | One PostgreSQL per deployment; no separate vector or graph database | relational + `pgvector` (later) cover the questions; fewer moving parts | 2026-11-24 |
| D3 | Self-hosted Docker stack (this repo's compose) is the target runtime; Supabase is not adopted for the Brain | the codebase is built for Postgres + Prisma + local volume; Supabase would duplicate auth/RLS. Supersedes the 2026-11-23 Supabase lean | 2026-11-24 |
| D4 | Memories are proposals until approved; assumptions never silently become rules; conflicts need a person | brief §3A | 2026-11-24 |
| D5 | Financial numbers only from deterministic engines in integer minor units | brief §3B, CLAUDE.md #1 | 2026-11-24 |

## Decisions waiting for Akram (critical only)
1. **Paradigm authorization** — approved hosting (your VPS vs a Paradigm-owned server/account), permitted AI provider, data scope. Blocks all real company data.
2. **Public repositories** — `PARADIGM-EVENTOPS` and several client-proposal repos/deployments are public. Make private?
3. **Personal & Development workspaces** — separate instance on personal infrastructure (recommended) vs same company database.
4. **Vercel deployment of EventOps** (`paradigm-eventops`, production from `claude/review-eventops-initial`) — which database does it use; keep or retire once the VPS is live?
5. **Margin convention** — the engine applies margin as a mark-up on cost (price = cost × (1 + m%)). Confirm this is how Paradigm's "12 % margin" is meant.

## Progress log
### 2026-11-24 — session 4 (branch `claude/akram-brain-memory`)
- Audit of reachable systems (GitHub, Vercel, Supabase, n8n, Paradigm People) → completion matrix in the Akram Brain doc.
- Built the persistent memory & learning engine (see `MEMORY_ENGINE.md`), quotation draft engine, assistant integration (`recall_memories`, "Remember…" → proposals), `/brain` Memory & Learning Center, permission `brain.use`, migration `20261124010000_brain_memory`.
- Evidence: unit 125/125 (13 new), integration 103/103 (7 new), typecheck + lint clean; 5 mutations, each caught (see BUILD_STATUS).

## Known issues
- Migration SQL was written by hand (Prisma's schema engine could not be downloaded in the build sandbox). It was applied to PostgreSQL 16 and exercised by every new test, but run `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <scratch-db>` once to confirm zero drift.
- `next build` passes on Vercel (preview of `7de772a` READY); `/brain` has not been visually checked yet.

## Next actions
1. Akram: decisions 1–5; review the PR.
2. Event Ledger commercial core: Organization, Contact, Quotation + versions + lines, VendorQuote lines, PO, Invoice, Payment, PriceObservation (derived).
3. Scenario B: vendor-quotation PDF → lines → catalog mapping → price history comparison (synthetic PDFs first).
4. Command Center ("Good morning — what do I need to know today?") on top of the ledger + memory; then the visual concepts (A/B/C) and the premium-dark design system.
