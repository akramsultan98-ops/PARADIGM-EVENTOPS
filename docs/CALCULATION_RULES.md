# Calculation rules

All calculations live in `src/engines/` (pure TypeScript, no I/O) and return a `CalcTrace`: engine, title, formula, inputs, outputs, assumptions, units, state, engine version, input hash. Traces are persisted as `CalculationRecord` rows and exported in workbook sheet 06.

## Production (`production/`)
| Calculation | Rule |
|---|---|
| Board cutting (`cutting.ts`) | Guillotine packing, best-area-fit, deterministic ordering (longest side ↓, area ↓, label). Usable board = (L − 2·trim) × (W − 2·trim). Each piece consumes (l + kerf) × (w + kerf) (no trailing kerf at a board edge). Rotation allowed unless the material requires grain direction. Offcuts shared across all panels of the same material in the project. Oversize panels are **not forced** → `NEEDS_INFORMATION` ("specify a joint"). |
| Board purchase | `CEILING(boards_used × (1 + material waste%))` (breakage allowance on top of the real cutting waste). |
| Board estimate (no drawing) | `CEILING(surface area × (1 + waste%) ÷ board area)` — only when no panel breakdown exists; always `ESTIMATED`, never called a cutting plan. |
| Timber (`timber.ts`) | 1D First-Fit-Decreasing on stock length; each additional cut on a stick consumes one kerf. Members **only** from drawing-derived FRAME_MEMBER specs — framing is never invented. Structural approval by a qualified engineer is stated in every trace. |
| Paint (`paint.ts`) | `Litres = Σ(area × sides × coats) ÷ coverage(m²/L) × (1 + waste%)`; containers = `CEILING(litres ÷ container size)` (container parsed from unit, e.g. "pail 18L"). Missing coverage or coats → `NEEDS_INFORMATION`. |
| Accessories | Explicit quantities from specs × (1 + waste%). |
| Item metrics | Installed area: deck W×D for STAGE/FLOORING, face W×H otherwise. Weight from material unit weights. Transport volume = **packed volume** if provided (else bounding box flagged ESTIMATED). Longest component = longest panel/frame member (not paint surfaces). |

## Manpower (`manpower.ts`)
- `Labour hours = quantity × approved productivity (h/unit)` per operation → trade mapping in `standards.activityMap` (panel fabrication, frame assembly, painting [area×coats], installation, loading, unloading, branding install, dismantle).
- Phase windows: WORKSHOP (workshop working days until load-out), LOADOUT (1 day), SITE (setup working hours inside venue access window, minus setup buffer), DISMANTLE.
- `Required crew = CEILING(total hours ÷ (min(shift − breaks, access window) × window days))`; shortfall vs headcount; crew with max overtime; cost = crew × days worked × daily rate.
- AV technician hours = `quantity × setup minutes ÷ 60` (direct hours).
- Missing productivity rate → hours `null`, issue `LABOR_RATE_MISSING` with a question for the standards administrator. **No default rates.**

## AV (`av.ts`)
`Allocated = MIN(required + backup, owned − out of service − booked on overlapping projects)`; `Rental = total − allocated`; rental cost = rental × daily rate × rental days (setup → dismantle). Power = `Σ quantity × rated W` (no diversity factor; backups not powered) compared with venue capacity. Approvals flagged: rigging, electrical, LED structure.

## Logistics (`logistics.ts`)
Cargo = production items (packed volume, weight), AV equipment (case volume × units, weight), extra cargo. Unknown weight/volume → not allocated (reported). Vehicles excluded if unavailable, in maintenance or booked on overlapping projects. FFD by volume with **both** payload × fill factor and volume × fill factor, plus longest-dimension check; loads then right-sized to the smallest suitable unused vehicle; backup = smallest unused vehicle able to carry the heaviest load. Travel time **only** from `RouteEstimate`; missing → `NEEDS_INFORMATION`, unapproved → `ESTIMATED`. Driver count checked.

## Accommodation (`accommodation.ts`)
Shared rooms = guests with the same room label in the same hotel. Room nights = Σ (check-out − check-in) days per room. Detects missing names, missing/invalid dates, overlapping bookings per person, room capacity, room-type availability, mismatched shared types, unconfirmed bookings, early departures.

## Budget (`budget.ts`)
Lines from: material purchases (library price), labour crews, AV rentals, vehicles × (event window + return travel days), rooms, prints, entered costs/quotes/actuals. Contingency % per currency. **Totals per currency**; conversion only with a stored `ExchangeRate` (rate, source, date shown); missing rates exclude that currency from the budget comparison with a warning. Unpriced items listed, never zero-filled.

## Scheduling (`scheduling/`)
- Calendars: workshop (company hours & working weekdays), venue access window (setup), continuous (travel, supplier lead times), dismantle.
- WBS generated from requirements: procurement → fabrication → paint → print → load-out → travel → unload → installs (by installation day) → AV installs (truss/power first; LED & lights after structural installs) → branding → AV test → rehearsal → final inspection → EVENT START (fixed) → EVENT END (fixed) → dismantle → return.
- Durations: labour hours ÷ crew; standard fixed durations (AV test, rehearsal, inspection) from company standards.
- CPM forward/backward pass with FS/SS/FF/SF + lag → ES/EF/LS/LF, total float, critical path; serial SGS with crew capacity per trade; conflicts: DEADLINE, FIXED_DATE, CAPACITY, CALENDAR_OVERFLOW, CYCLE, RESOURCE_DELAY. Transport is just-in-time (load-out on the departure day, depart to arrive at setup start).
- Procurement order-by = first scheduled use − supplier lead time; negative slack → `PROCUREMENT_LATE`.

## Risk (`risk.ts`)
Severity = probability × impact (1–5 each); levels from configurable thresholds (default medium ≥5, high ≥10, critical ≥16). Rules derive hypothetical risks from plan facts (vehicle breakdown with backup & route time, rental delivery, equipment failure, power, material shortage, crew shortage, setup overrun, venue access, hotel booking, internet, client approval). Generated risks are `IDENTIFIED`, never incidents.

## Change impact & what-if
`compareImpact(base, next)` diffs materials, labour, AV, transport, accommodation, schedule, budget, procurement, risk and lists departments whose approval is required. `applyScenario` (setup days, vehicles unavailable, supplier/travel delays, participants, budget %, price %, crew unavailable, event shift, item resize) works on a copy. Participant changes have **no invented quantity rules** — affected departments are asked to review.
