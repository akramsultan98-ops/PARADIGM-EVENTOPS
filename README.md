# PARADIGM EVENTOPS

**Event Operations & Intelligence Platform** — *Plan Smarter. Execute Better. Control Everything.*

An internal Paradigm LTD platform that turns department inputs (Production, AV & Technical, Logistics, Accommodation, Creative & Branding, Procurement, Account Management) into one coordinated, validated, approved and executable event plan — and then tracks live execution against it.

```
Department inputs ─▶ extraction & validation ─▶ deterministic engines ─▶ AI orchestrator (typed tools)
   ─▶ scheduling & optimisation ─▶ master plan ─▶ approvals ─▶ live execution ─▶ actual vs planned
```

> The application ships with a connected demonstration dataset. Every demo record is labelled
> **DEMO DATA — NOT APPROVED PARADIGM COMPANY DATA**. Material prices, productivity rates, vehicles,
> vendors, hotels and routes are placeholders that must be replaced with approved Paradigm standards.

## What is in the box

| Area | Highlights |
|---|---|
| Projects | Creation wizard, 20-tab project workspace, department assignment, status lifecycle, comments, audit history |
| Department workspaces | Dedicated dashboards for Project Management, Production, AV, Logistics, Accommodation, Creative, Procurement, Account Management, plus a personal "my work" strip |
| Department inputs | 10-step production form, AV requirements form, cargo / rooming / branding editors, **conversational input** (AI or deterministic rule-based extraction) with evidence, follow-up questions and correction before submission, document upload with extraction review |
| Calculation engines | Board cutting optimisation (guillotine, kerf, edge trim, grain, offcut reuse), 1D timber cutting, paint, BOQ, manpower crews, AV allocation & rentals, fleet packing (weight **and** volume), accommodation, budget (per-currency), risks — all deterministic, unit-tested and traceable |
| Planning | WBS generation, calendar-aware CPM (FS/SS/FF/SF + lag), resource-constrained scheduling, critical path, conflict explanations (tasks are never dropped), interactive Gantt, manual rescheduling with dependency propagation |
| Change & what-if | Change requests with full impact analysis across 9 domains and routed approvals; what-if simulations on plan copies (setup days, vehicle breakdown, delays, participants, budget) |
| Approvals | Department technical approval → integrated plan approval → Finance cost approval → Super Admin standards approval; versioned plans never overwritten |
| Execution | Mobile-first site board: start/progress/complete, delays with recovery suggestions, issues, inspections, site photos, actual consumption; actual-vs-planned accuracy by category |
| Exports | 20-sheet branded Master Workbook (`PARADIGM_EVENTOPS_[PROJECT]_MASTER_PLAN.xlsx`), department sheets, PDF plan report, RFQ PDF, CSV extracts, audit CSV |
| AI | Claude (`claude-opus-5-5`) via provider abstraction: structured extraction and an orchestrator assistant that answers **only** through typed tools over the deterministic engines. Without an API key everything works in rule-based mode |
| Platform | English/Arabic with full RTL, role-based permissions enforced server-side, company-level tenant isolation, audit log, rate limiting, secure uploads, health check, Docker, backups, optional OR-Tools CP-SAT service |

## Quick start (development)

Requirements: Node.js 22, PostgreSQL 16 (or Docker).

```bash
cp .env.example .env            # then set AUTH_SECRET (≥32 chars) and DATABASE_URL
npm install
npx prisma migrate deploy       # create the schema
npm run db:seed                 # load the connected demo environment (dev only)
npm run dev                     # http://localhost:3000
```

Development demo accounts (only when `ENABLE_DEMO_LOGIN=true` in a non-production build; the seed refuses to run in production and refuses to wipe a database that has real user accounts):

| Email | Role |
|---|---|
| `pm@demo.eventops.local` | Project Manager |
| `account@demo.eventops.local` | Account Manager |
| `production@demo.eventops.local` | Production Manager |
| `production.member@demo.eventops.local` | Department Member (Production) |
| `av@` / `logistics@` / `accommodation@` / `creative@` / `procurement@` `demo.eventops.local` | Department managers |
| `finance@demo.eventops.local` | Finance |
| `admin@demo.eventops.local` | Super Admin |
| `viewer@demo.eventops.local` | Viewer |

Password: `EventOps!2026` (override with `DEMO_PASSWORD` before seeding).

### Docker

```bash
cp .env.example .env            # set AUTH_SECRET and POSTGRES_PASSWORD; ENABLE_DEMO_LOGIN="false" outside dev
docker compose up -d --build                                               # app + PostgreSQL (migrations run on start)
docker compose --profile optimizer up -d                                   # + OR-Tools service
```

## Tests

```bash
npm run test:unit          # 83 engine, extraction & auth-guard tests (no database)
npm run test:integration   # service tests against TEST_DATABASE_URL (migrate deploy + demo seed)
npm run test:e2e           # Playwright: full MVP workflow, security, mobile & Arabic RTL (needs the app running or starts `npm run dev`)
cd services/optimizer && pytest -q   # OR-Tools solver tests
```

## Documentation

`CLAUDE.md` (development rules) · `docs/PRODUCT_SPEC.md` · `docs/SYSTEM_ARCHITECTURE.md` · `docs/DATABASE_SCHEMA.md` · `docs/CALCULATION_RULES.md` · `docs/AI_ORCHESTRATION.md` · `docs/SECURITY_MODEL.md` · `docs/DEPARTMENT_WORKFLOWS.md` · `docs/IMPLEMENTATION_ROADMAP.md` · `docs/DEPLOYMENT.md` · `docs/USER_GUIDE.md` · `docs/ACCURACY_VALIDATION.md` · **`docs/BUILD_STATUS.md`** (current state, test results, next steps)

## Brand

The Paradigm crest and wordmark (`public/branding/`) are the approved logo found in earlier Paradigm projects (`paradigm-feedback/Asset 193.png`, also embedded in `paradigm-kms`), used unmodified except for proportional resizing and a crest-only crop. Colours follow the Paradigm interfaces: navy `#061520`, cyan `#00A8C8`. All tokens live in `src/app/globals.css`, `tailwind.config.ts` and `src/config/brand.ts`.
