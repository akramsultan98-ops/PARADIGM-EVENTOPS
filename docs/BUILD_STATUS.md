# Build status — PARADIGM EVENTOPS

_Last updated: 2026-11-19 (session 3 — security remediation sprint on PR #2). Read this first when resuming work._

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

## Session 3 — security remediation sprint (PR #2)
Fixes for the independent audit (P1-1…P3) and the Codex review on `c053125`. Every finding has a regression test; "mutation" = the fix was reverted/weakened and the test was confirmed to fail.

| # | Finding | Fix | Regression test |
|---|---|---|---|
| P1-1 (+Codex P1) | Plan generation overwrote approval with calculation state → approved items editable, approved AV deletable | `approvalStatus` (SourceApprovalStatus) separate from `calculationState` (@map("state")); migration backfills approvals from submission decisions; planning writes calculation state only | `approval-state.test.ts` submit→approve→generate×2→edit/delete rejected (production + AV); approved change request keeps approval. Mutation: 2 fail |
| P1-2 | `budget.read` bypass (budget tab, workbook, assistant, overview, workspaces…) | `src/lib/financial.ts` redaction at the data source (plan loaders, project context, read models, workbook, PDF, assistant, procurement, library pages); BudgetTab refuses server-side | `financial-confidentiality.test.ts` role matrix ×6 roles over routes/loaders/BudgetTab/assistant (43 checks); `financial-redaction.test.ts`; E2E `financial.spec.ts`. Mutation: 20 fail |
| P1-3 | Non-atomic approvals, concurrent double decisions, invalid values failing after approval, self-approval | `change-validation.ts`; `decideApprovalAction` = one transaction with conditional PENDING claim; `approvePlan` transactional; self-approval blocked | `approval-atomicity.test.ts` (fractional/negative values, stale change rollback, parallel approvers on change and submission, deterministic row-lock race, self-approval PM/Super Admin, re-decision); `change-validation.test.ts`. Mutation (claim without PENDING): fails |
| P2-A | Review of DRAFT/NEEDS_INFORMATION, self-review, ESTIMATED promoted, incomplete form submission | `services/review.ts` status gate, self-review block, missing-field block, only UNDER_REVIEW promoted; submit check for all methods | `p2-guards.test.ts` P2-A |
| P2-B | Change-request typing/ownership | (P1-3) + ownership check on propose and apply | `approval-atomicity`, `workflow.test.ts` |
| P2-C | Vendor swap after approval, quote reselection, unvalidated vendor, lost delivery updates | Company-scoped vendor, locked after submission; order uses approved vendor; conditional transitions; atomic increments | `p2-guards.test.ts` P2-C (incl. concurrent deliveries) |
| P2-D | Reschedule of approved schedule without approval, other departments' tasks, ahead of predecessors | Plan-approval authority required on approved schedules (recorded as approver); department scope; predecessor constraints; event milestones fixed; transactional | `p2-guards.test.ts` P2-D |
| P2-E | Negative/zero sizes, unbounded quantities, unvalidated enums/status | `lib/validation.ts`; piece/unit limits; engines report invalid/oversized input (cutting, timber, BOQ, fleet) | `engine-guards.test.ts`, `p2-guards.test.ts` P2-E |
| P2-F (+Codex P2×2) | Labour double-booked across projects; standby vehicle not reserved; backup vehicle too short | Crew availability nets out other projects' planned crews; standby reserved as `ResourceAssignment`; backup must fit longest piece | `engine-guards.test.ts`, `p2-guards.test.ts` P2-F. Mutation: 2 fail |
| P2-G | Uploads read fully before size check; zip bombs; unbounded PDF; task photo ownership | Declared-size check, ZIP central-directory inspection, PDF page cap, timeouts, 21 MB body limit, task ownership | `engine-guards.test.ts` (synthetic bombs), `p2-guards.test.ts` P2-G |
| P2-H (+Codex P2) | RFQ without permission; foreign leads/room types/tasks; viewer comments | RFQ requires `procurement.manage`; ownership checks; read-only roles cannot comment | `financial-confidentiality.test.ts` (RFQ), `p2-guards.test.ts` P2-H |
| P3 | CSP/HSTS, backup credentials/encryption, password-change sessions, proxy IP, duplicate approvals, code collisions, AI evidence, rate units | Headers; encrypted backup via PGPASSWORD; session-version bump; `TRUST_PROXY_HOPS`; partial unique index (one PENDING approval per entity); retry on code collision; evidence must be quoted from input; unit preserved on standards approval | `p3-hardening` (unit + integration incl. real pg_dump + decrypt, argv inspection), E2E header test |

### Tests executed (session 3, final)
| Suite | Result |
|---|---|
| `npm run lint` / `npm run typecheck` | clean / clean |
| `npm run test:unit` | **111 / 111** |
| `npm run test:integration` (PostgreSQL) | **91 / 91** |
| `npm run test:e2e` (desktop + mobile, dev server with CSP) | **13 / 13** |
| `npm run build` | successful (Google Fonts fetch flaked once, retry succeeded) |
| Production smoke under CSP (`next start`) | hydration + server action round-trip OK, 0 console/CSP errors |
| `pytest services/optimizer` | 3 / 3 |

### Remaining limitations / deferred (risk-based)
- CSP keeps `'unsafe-inline'` for scripts (Next.js bootstrap); nonce-based CSP via middleware is the next step.
- Plan approval by the PM who generated the plan is allowed (generation is a calculation, not a proposal); all other approval types enforce four-eyes.
- Cross-project labour uses a lower bound per project per day (largest planned crew) — never overstates commitments; exact per-hour overlap is not modelled.
- Manual reschedules on a non-executing project are replaced when the plan is regenerated (by design: the plan is recalculated); approved schedules require PM authority to change.
- Vehicle availability change requests affect the vehicle company-wide (fleet is a company resource).
- Rate limiting is in-memory per process; `npm audit`: 7 advisories needing major upgrades (Prisma 7, Next 16); Docker image build not run (no daemon); live Claude path not exercised (evidence verification is unit-tested); Egypt DST not modelled.
- Integration test DB is reset with `SEED_FORCE_RESET=true` (test database only).

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
- **Change requests could target another project/company (P2, found after PR #1 was closed):** `proposeChangeAction` read the target by ID only and `applyApprovedChange` updated it by ID only, so an approval on project A could modify a production item / equipment requirement of project B, another project row, or another company's vehicle. New `loadChangeTarget()` enforces ownership at proposal time and again before applying. Regression test fails without the check, passes with it.

## Tests executed (session 2, after the changes above)
| Suite | Result |
|---|---|
| `npm run lint` | ✔ no warnings or errors |
| `npm run typecheck` | clean |
| `npm run test:unit` | **83 / 83** (adds 14 auth-guard tests) |
| `npm run test:integration` | **16 / 16** (adds 5 tests for the PR review fixes) |
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
