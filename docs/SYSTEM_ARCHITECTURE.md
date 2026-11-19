# System architecture

```
Browser (Next.js App Router, React 19, Tailwind, Radix/shadcn-style UI, EN/AR RTL)
   │  server components (read) · server actions (write) · route handlers (exports/downloads)
   ▼
Next.js server (Node 22)
   ├─ lib/auth        signed HttpOnly JWT cookie (jose, HS256) + DB check of session version & active flag
   ├─ lib/permissions role → permission matrix (mirrored in DB), department-scoped technical approval
   ├─ server/actions  validated (zod), authorised, audited mutations → ActionResult
   ├─ server/services snapshot builder · plan persistence & approval · change application · workbook · pdf · storage
   ├─ server/queries  page read models (always company/user scoped)
   ├─ ai/             provider abstraction (Anthropic Claude) · rule-based extractor · validators · orchestrator
   └─ engines/        PURE deterministic engines (no I/O) ← unit tested
        snapshot → production BOQ → AV → cargo/fleet → windows → labour → WBS → schedule → procurement → budget → risks → readiness
   ▼
PostgreSQL 16 (Prisma 6) — tenant-aware schema, migrations, audit log
Storage abstraction — local volume (dev/VPS); S3 adapter interface (not implemented)
Optional: services/optimizer (Python, OR-Tools CP-SAT, FastAPI) via OPTIMIZER_URL · n8n webhook via N8N_WEBHOOK_URL
```

## Key design decisions
- **ProjectSnapshot is the single input contract** to the pipeline (`src/engines/snapshot.ts`). The DB builds it (`server/services/snapshot.ts`); what-if and change-impact simply modify a copy and re-run the same pure pipeline. This guarantees identical behaviour between real plans and simulations and makes results reproducible (same inputs → same input hash).
- **Persisted plan = immutable version.** `ScheduleVersion.snapshot` stores the full `PlanResult` (tasks, BOQ, traces, issues, risks). Relational rows (tasks, procurement requests, cost items, risks, calculation records, reservations) are derived for interaction; pages read the latest non-superseded version.
- **Central orchestrator with typed tools**, not free-running agents. The assistant can call `list_projects`, `get_project_overview`, `list_open_issues`, `get_plan_section`, `run_what_if` — all deterministic.
- **Scheduler:** calendar-aware CPM with FS/SS/FF/SF + lag, resource-constrained serial SGS (least-late-start priority), deadline/fixed-date/capacity/calendar conflicts. CP-SAT service is an optional advisory cross-check.
- **Cross-project resources:** `ResourceAssignment` rows (equipment, vehicles) are created on plan generation and read by other projects' snapshots → double-booking and rental gaps are detected across projects.
- **Department workspaces & project tabs share panels** (`components/planning/panels.tsx`) to keep one rendering of each calculation.
- **i18n:** cookie-selected locale, server-rendered `lang`/`dir`, dictionaries in `src/i18n`, logical CSS properties throughout.

## Request flow example — "Generate plan"
`ProjectActions` (client) → `generatePlanAction` (auth, `plan.generate`, scope) → `generatePlan` service → `buildSnapshot` → `runPlanningPipeline` → transaction: new `ScheduleVersion`, supersede drafts, calculation records, material calcs, cutting plans, tasks + dependencies, labour assignments, reservations, vehicle assignments, procurement requests (drafts only), cost lines, regenerated hypothetical risks (human-edited risks kept), PLAN approval → notifications to departments with open questions and to PMs.
