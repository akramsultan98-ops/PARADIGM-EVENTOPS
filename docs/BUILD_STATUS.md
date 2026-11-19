# Build status — PARADIGM EVENTOPS

_Last updated: 2026-11-19 (session 2 — pre-PR review & hardening). Read this first when resuming work._

## Summary
The MVP workflow (spec §38) is implemented and verified end-to-end through the real UI by an automated Playwright test. The application is a working Next.js 15 + PostgreSQL/Prisma platform with deterministic planning engines, role-based workspaces, approvals, execution tracking and exports. Demo data is connected and clearly labelled.

## Repository audit (Phase 0)
- Repository was empty (no commits). Project initialised from scratch.
- Branding: the approved Paradigm crest + wordmark was found in prior Paradigm repos (`paradigm-feedback/Asset 193.png`, labelled "Paradigm Ltd Logo", also embedded in `paradigm-kms`). Copied unmodified (proportional resize + crest-only crop) to `public/branding/`. Brand colours taken from `paradigm-kms` (navy `#061520`, cyan `#00A8C8`). The logo's wordmark reads "PARADIGM CAPITAL GROUP" — confirm with Marketing that this is the correct mark for Paradigm LTD.

## Completed & working
| Area | State |
|---|---|
| Design system, shell, login, role-aware navigation, EN/AR + RTL, mobile drawer | ✅ |
| PM dashboard; department dashboards (Production, AV, Logistics, Accommodation, Creative, Procurement, Account) + personal work strip | ✅ |
| Projects list, 5-step creation wizard, 20-tab project workspace | ✅ |
| Production 10-step form; AV form; cargo, rooming, branding editors; brief requirements; manual costs | ✅ |
| Conversational input (rule-based always; Claude when `ANTHROPIC_API_KEY` set) with evidence, follow-up questions, correction, drawing attachment | ✅ |
| Document upload (validated, hashed, private), text extraction (PDF/DOCX/CSV/XLSX), extraction review | ✅ |
| Engines: cutting, timber, paint, BOQ, manpower, AV, logistics, accommodation, budget, CPM/SGS scheduler, risks, change impact, what-if | ✅ unit tested |
| Plan generation & persistence (versions, traces, tasks, procurement, costs, risks, reservations) | ✅ integration tested |
| Approvals: technical (department-scoped), integrated plan (gated), procurement (Finance), budget, change requests, standards (Super Admin) | ✅ |
| Gantt, timeline, manual reschedule with dependency propagation | ✅ |
| What-if simulations, change requests with impact | ✅ |
| Live execution (mobile), delays with recovery suggestions, issues, photos, actuals; actual vs planned | ✅ |
| Exports: 20-sheet workbook, department sheet groups, PDF report, RFQ PDF, tasks CSV, audit CSV | ✅ |
| AI assistant with typed tools / rule-based mode | ✅ (rule mode verified; AI path compiled but **not exercised** — no API key in this environment) |
| Knowledge base: libraries, versioned standards, rate proposals, CSV/XLSX import (preview → mapping → validation/duplicates → confirm) | ✅ |
| Users & roles (create, change role, deactivate → session revocation), permission matrix, settings, password change | ✅ |
| Security: server-side authz, tenant scoping, rate limits, headers, upload validation, audit log, 403 page | ✅ |
| OR-Tools CP-SAT service + adapter + `/api/projects/[id]/optimize` (advisory) | ✅ solver tested; not wired into the UI |
| Docker (standalone image, compose with Postgres + optional optimizer), health check, backup script | ✅ written; **docker build not run here** (no Docker daemon in this environment) |

## Session 2 — pre-merge review & hardening
- **Secrets:** no API keys, tokens, private keys or real credentials are tracked (`.env` is git-ignored; only `.env.example` placeholders). Production client bundle scanned: no secrets, no demo password.
- **Demo credentials:** the demo password is no longer compiled into the client bundle (rendered server-side only when demo login is on). New `demoLoginEnabled()` (`src/lib/auth/demo.ts`): demo login is ignored in production builds unless `ALLOW_DEMO_LOGIN_IN_PRODUCTION=true` is also set — verified against `next start` with `ENABLE_DEMO_LOGIN=true` (no demo accounts offered).
- **Seed safety:** `db:seed` now refuses to TRUNCATE a database that contains non-demo user accounts unless `SEED_FORCE_RESET=true` (verified on a scratch DB).
- **Login hardening:** constant-time-ish bcrypt for unknown accounts, extra per-account rate limit, stricter `next` redirect guard (`src/lib/auth/redirect.ts`, rejects `/\host` and control chars).
- **Audit CSV** export escapes spreadsheet formulae.
- **docker-compose** now requires `POSTGRES_PASSWORD` (no weak default).
- **zod 3.25 → 4.6.7** (GHSA memory-exhaustion advisory affecting server-action validation); two `z.record` call sites and one coerce input type adjusted.
- **Lint** run for the first time: 4 unused-variable warnings fixed → clean.
- **Migrations** verified: `prisma migrate diff --from-migrations … --to-schema-datamodel` → no difference.

### PR review fixes (Codex findings on PR #1)
- **Project scope bypass via search (P2):** `projectScope()` put the member/department restriction in a top-level `OR`, which `/projects?q=` and `/search?q=` overwrote with their own `OR` — department members could find any company project. The restriction now lives under `AND`. Regression test fails on the old code (member saw the probe project) and passes now.
- **Approved production items editable (P1):** re-saving with an approved item's own `submissionId` skipped the guard and overwrote approved values; the submission row was also updated before the check. All checks now run before any write: approved submissions and approved items are rejected regardless of submission, and the submission must belong to Production. 3 action-level integration tests (2 fail on the old code).

## Tests executed (session 2, after the changes above)
| Suite | Result |
|---|---|
| `npm run lint` | ✔ no warnings or errors |
| `npm run typecheck` | clean |
| `npm run test:unit` | **83 / 83** (adds 14 auth-guard tests) |
| `npm run test:integration` | **15 / 15** (adds 4 tests for the PR review fixes) |
| `npm run test:e2e` (desktop + mobile) | **6 / 6** |
| `npm run build` | successful, 47 routes (one transient Google Fonts fetch failure on first attempt — build needs network to fonts.googleapis.com) |
| `pytest services/optimizer` | **3 / 3** |
| `npm audit --omit=dev` | 7 remaining (prisma CLI → deepmerge-ts, next → postcss build-time, exceljs → uuid); all need major upgrades (prisma 7, next 16) — tracked, not runtime-exploitable in current usage |

## Tests executed (session 1)
| Suite | Command | Result |
|---|---|---|
| Unit (engines, AI rules) | `npm run test:unit` | **69 / 69 passed** |
| Integration (services vs test DB) | `npm run test:integration` | **11 / 11 passed** |
| E2E MVP workflow (desktop) | `npx playwright test tests/e2e/mvp-workflow.spec.ts` | **passed** (create → submit ×4 depts → plan → missing info → conversational completion → technical approvals → plan approval → workbook → execution → actual vs planned) |
| E2E security | `tests/e2e/security.spec.ts` | **3 / 3 passed** |
| E2E mobile + Arabic RTL | `tests/e2e/mobile.spec.ts` | **2 / 2 passed** |
| OR-Tools solver | `pytest services/optimizer` | **3 / 3 passed** |
| Typecheck / production build | `npm run typecheck`, `npm run build` | **clean / successful (47 routes)** |
| Visual QA | `scripts/shot.mjs` over 51 routes as PM/Admin, Arabic & 412 px mobile | all 200, no runtime errors |

## Known limitations (honest list)
- **Demo libraries only**: materials, productivity rates, vehicles, vendors, hotels, routes and the FX rate are placeholders (`DEMO`). No real Paradigm data has been entered. The Helper "DISMANTLE" rate is intentionally missing to demonstrate `NEEDS_INFORMATION`.
- **No accuracy claim** — see `ACCURACY_VALIDATION.md`. Demo actual-vs-planned numbers are synthetic.
- Arabic: navigation, header, statuses and common UI are translated with full RTL; most page-level descriptive copy and table headers are still English. PDF exports use standard Latin fonts (Arabic text would render as "?").
- Engines assume Cairo = UTC+2 (`timezoneOffsetHours`); Egypt's summer DST (UTC+3) is not modelled in scheduling calendars.
- S3 storage driver is an interface only (refuses to run); use the local volume.
- Rate limiting is in-memory per process; the IP key trusts `X-Forwarded-For`, so deploy behind a proxy that overwrites it.
- No Content-Security-Policy / HSTS header yet (X-Frame-Options, nosniff and Referrer-Policy are set); add CSP with nonces and HSTS at the proxy.
- `next build` downloads Google Fonts; offline/air-gapped Docker builds need self-hosted fonts.
- Image/vision extraction is not implemented (images are stored; no values extracted).
- Change requests support item dimensions/quantity, participants, budget, dates, vehicle availability and AV quantities; component lists are scaled proportionally and flagged "revised drawing required".
- OR-Tools service works in continuous working minutes (no calendar gaps) and is advisory only.
- Library records are maintained through import and standards proposals; there is no inline CRUD editor for each library row.
- Hydration warnings seen during automated screenshots were traced to Playwright's caret hiding, not the app.

## Remaining work / next implementation task
1. **Next task:** load real Paradigm libraries via Knowledge Base → Import and approve standards; confirm the logo variant with Marketing.
2. Complete Arabic copy for page bodies; embed an Arabic font in PDF exports.
3. Exercise and harden the Claude path with a real `ANTHROPIC_API_KEY` (extraction quality evaluation set).
4. CI pipeline (GitHub Actions: lint, typecheck, unit, integration with Postgres service, E2E). Create the `main` branch (repository currently has none).
5. Upgrade Prisma 7 / Next 16 to clear remaining `npm audit` advisories; add CSP + HSTS; run `docker build` once a daemon is available.
6. S3 driver, shared rate-limit store, DST-aware calendars.
7. Inline library editors; vision extraction; calendar-aware OR-Tools model selectable from Master Planning.

## How to resume
```bash
service postgresql start   # or docker compose up -d db
npm install && npx prisma migrate deploy && npm run db:seed && npm run dev
```
