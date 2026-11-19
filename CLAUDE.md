# CLAUDE.md — PARADIGM EVENTOPS development rules

Source of truth for how to work in this repository. Read `docs/BUILD_STATUS.md` first to see what is done and what is next.

## Non-negotiables
1. **Numbers come from deterministic engines** (`src/engines/**`), never from LLM text. Every engine returns a `CalcTrace` (formula, inputs, outputs, assumptions, units, state, engine version, input hash).
2. **Never invent company data.** Missing productivity rates, dimensions, route durations, prices, quantities → `NEEDS_INFORMATION` issue with a question for the owning department. Estimates are labelled `ESTIMATED`.
3. **Never drop tasks to make a schedule look feasible.** Report conflicts with explanations.
4. **Never overwrite an approved plan.** Generation creates a new `ScheduleVersion`; changes go through `ProjectChange` + approval.
5. **AI and business logic stay separate.** AI extracts drafts and orchestrates via typed tools (`src/ai/assistant.ts`). Extracted values are drafts until a person confirms them; standards change only via Super Admin approval.
6. **Authorisation is server-side.** Every server action / route calls `requireUser()` + `assertCan()` / `requirePermission()` and scopes queries with `projectScope(user)` / `companyId`. Client checks are cosmetic.
7. **Demo data must stay labelled** `DEMO DATA — NOT APPROVED PARADIGM COMPANY DATA` and `isDemo`/`status: DEMO`.
8. Do not run `prisma migrate reset` against any database without explicit user consent. Use `prisma migrate dev` (local) / `migrate deploy` (servers).

## Layout
```
src/engines/        pure TS calculation & planning engines (no DB, no I/O) + unit tests in tests/unit
  production/       cutting.ts, timber.ts, paint.ts, boq.ts
  scheduling/       calendar.ts, scheduler.ts (CPM + SGS), optimizer-adapter.ts
  manpower.ts av.ts logistics.ts accommodation.ts budget.ts risk.ts pipeline.ts impact.ts whatif.ts snapshot.ts trace.ts
src/ai/             provider (Anthropic), rule-based extractor, validators, orchestrator assistant
src/server/services DB-facing services: snapshot builder, plan persistence/approval, changes, workbook, pdf, storage
src/server/actions  "use server" actions — ONLY async functions may be exported from these files
src/server/queries  read models for pages
src/components      ui/ (design system), shell/, planning/ (panels, gantt), project/ (tabs), departments/, execution/
src/app/(app)       authenticated pages; src/app/(auth)/login; src/app/api/* (exports, downloads, health)
src/demo/aswan.ts   the single demo dataset used by seed AND tests
prisma/             schema, migrations, seed.ts
services/optimizer  optional Python OR-Tools CP-SAT service
```

## Conventions
- Design tokens only (`globals.css` variables → `tailwind.config.ts`). Use logical properties (`ms-`, `pe-`, `start-`, `end-`) so Arabic RTL works. Directional icons get `rtl:-scale-x-100`.
- Money `Decimal(14,2)`, quantities `Float`. Use `num()` from `src/lib/db.ts`. Never sum different currencies.
- Times are stored UTC; displayed in Africa/Cairo (`src/lib/format.ts`). Engines use `standards.timezoneOffsetHours` (2 — Egypt DST is a known limitation, see BUILD_STATUS).
- New engine logic ⇒ unit test in `tests/unit`. New service ⇒ integration test in `tests/integration`.
- Server action files: return `ActionResult` via `run()` (`src/server/actions/_util.ts`), audit important actions with `audit()`.
- Department workspaces & project tabs reuse `src/components/planning/panels.tsx` — extend panels, don't duplicate tables.

## Commands
`npm run dev` · `npm run build` · `npm run typecheck` · `npm run db:seed` · `npm run test:unit` · `npm run test:integration` · `npm run test:e2e` · `node scripts/shot.mjs <email|-> <outdir> <paths…>` (visual QA screenshots; `LOCALE=ar`, `W=412 H=915` for mobile)

## Before ending a session
Run unit + integration tests, typecheck, build; update `docs/BUILD_STATUS.md` (completed, working, tests run + results, remaining work, limitations, next task).
