# Build status — PARADIGM EVENTOPS

_Last updated: 2026-11-19 (session 1). Read this first when resuming work._

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

## Tests executed (this session)
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
- Rate limiting is in-memory per process.
- Image/vision extraction is not implemented (images are stored; no values extracted).
- Change requests support item dimensions/quantity, participants, budget, dates, vehicle availability and AV quantities; component lists are scaled proportionally and flagged "revised drawing required".
- OR-Tools service works in continuous working minutes (no calendar gaps) and is advisory only.
- Library records are maintained through import and standards proposals; there is no inline CRUD editor for each library row.
- Hydration warnings seen during automated screenshots were traced to Playwright's caret hiding, not the app.

## Remaining work / next implementation task
1. **Next task:** load real Paradigm libraries via Knowledge Base → Import and approve standards; confirm the logo variant with Marketing.
2. Complete Arabic copy for page bodies; embed an Arabic font in PDF exports.
3. Exercise and harden the Claude path with a real `ANTHROPIC_API_KEY` (extraction quality evaluation set).
4. CI pipeline (GitHub Actions: typecheck, unit, integration with Postgres service, E2E).
5. S3 driver, shared rate-limit store, DST-aware calendars.
6. Inline library editors; vision extraction; calendar-aware OR-Tools model selectable from Master Planning.

## How to resume
```bash
service postgresql start   # or docker compose up -d db
npm install && npx prisma migrate deploy && npm run db:seed && npm run dev
```
