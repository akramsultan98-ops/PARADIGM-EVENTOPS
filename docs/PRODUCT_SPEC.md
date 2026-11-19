# Product specification — PARADIGM EVENTOPS

**Product:** PARADIGM EVENTOPS — Event Operations & Intelligence Platform
**Tagline:** Plan Smarter. Execute Better. Control Everything.
**Organisation:** Paradigm LTD · **Market:** Egypt · **Currency:** EGP · **Timezone:** Africa/Cairo · **Languages:** English, Arabic (RTL)

## Vision
Treat every event as **one connected project**. Departments provide real technical requirements; the system validates them, calculates quantities and resources deterministically, schedules a feasible plan, routes approvals, then tracks execution and learns from actual-vs-planned variance.

## Core workflow (implemented)
1. Account Manager creates the project (wizard) and assigns departments with leads and due dates.
2. Departments submit requirements — structured forms (10-step production wizard, AV form, cargo, rooming, branding editors) or **conversational input** with document upload.
3. Extraction (AI or rule-based) produces drafts with evidence and follow-up questions. Nothing is approved automatically.
4. Department managers give **technical approval** (department-scoped).
5. The Project Manager runs **Generate plan**: BOQ, cutting plans, timber, paint, manpower, AV allocation & rentals, fleet packing, rooming, procurement dates, budget, WBS, schedule, risks, readiness issues and clarification questions.
6. Change requests and what-if simulations show impact without touching the approved baseline.
7. The PM **approves the integrated plan** (blocked while technical approvals are outstanding; open errors must be explicitly acknowledged). Finance approves purchases and budgets; Super Admin approves standards changes.
8. Master Workbook (20 sheets) / PDF / CSV exports.
9. Teams execute on mobile: task progress, delays with recovery options, issues, inspections, photos, actual consumption.
10. Actual vs planned accuracy per category; systematic variance becomes a standards proposal for the Super Admin.

## Modules & screens
Login · Main dashboard (PM) · Department dashboards (Production, AV, Logistics, Accommodation, Creative, Procurement, Account) · Projects list · Project creation wizard · Project workspace with 20 tabs (Overview, Brief, Department Inputs, Master Planning, Production, AV, Logistics, Accommodation, Creative, Timeline, Gantt, BOQ, Manpower, Procurement, Risk Register, Budget, Site Execution, Documents, Approvals, Activity) · Production input form · BOQ review · AV requirements form · Vehicle planning · Rooming list · Resources & inventory · Manpower planning · Planning & scheduling (Gantt) · Risk register · Budget · Live execution · Actual vs planned · Document center · AI assistant · Approval center · Notifications · Settings · Knowledge base (libraries, standards, import) · Users & roles · Reports · Search · Access denied.

## Data states (spec §17C)
`VERIFIED`, `CALCULATED`, `ESTIMATED`, `NEEDS_INFORMATION`, `UNDER_REVIEW`, `APPROVED`, `REJECTED` — shown on every BOQ line, trade plan, cargo item, item and calculation record. A calculation is never presented as an engineering verification.

## Out of scope / not yet implemented
See `BUILD_STATUS.md` → Known limitations.
