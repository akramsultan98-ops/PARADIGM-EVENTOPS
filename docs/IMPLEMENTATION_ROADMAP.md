# Implementation roadmap

Status legend: ✅ implemented & tested · 🟡 implemented, partial · ⬜ not started. Details per phase in `BUILD_STATUS.md`.

| Phase | Scope | Status |
|---|---|---|
| 0 Foundation | Repo audit, branding search (real Paradigm logo found), architecture, docs, tooling | ✅ |
| 1 Design system & shell | Tokens, sidebar/header, role-aware nav, login, PM dashboard, responsive shell, EN/AR + RTL | ✅ (Arabic covers navigation/common UI; long-form page copy still English 🟡) |
| 2 Projects & workspaces | Projects, wizard, 20-tab workspace, department dashboards, forms, uploads, validation, approvals, notifications | ✅ |
| 3 Database & knowledge base | Schema, migrations, seed, libraries, historical events, import with preview/mapping/duplicates | ✅ (library record editing UI limited to import + proposals 🟡) |
| 4 Deterministic engines | BOQ, cutting, timber, paint, manpower, AV, logistics, accommodation, cost | ✅ |
| 5 Planning engine | WBS, dependencies, CPM, resource-constrained scheduling, Gantt, conflicts, risks | ✅ (OR-Tools service advisory only 🟡) |
| 6 AI orchestrator | Conversational input, document extraction, missing-data detection, typed-tool assistant, change impact, what-if | ✅ (AI path requires API key; image/vision extraction not implemented 🟡) |
| 7 Live execution | Task updates, actuals, delays + recovery, photos, alerts, actual vs planned | ✅ |
| 8 Reporting | 20-sheet workbook, department exports, PDF, CSV, audit CSV | ✅ (PDF Latin fonts only 🟡) |
| 9 Hardening | Security headers, rate limits, audit, Docker, health check, backups, tests | 🟡 (S3 driver, shared rate-limit store, Egypt DST, CI pipeline pending) |

## Next priorities
1. Replace demo libraries with approved Paradigm data (materials, rates, fleet, vendors, routes) via the importer; approve standards.
2. Full Arabic translation of page-level copy; embed an Arabic font in PDF exports.
3. S3-compatible storage driver; Redis-backed rate limiting; CI (GitHub Actions) running unit + integration + E2E.
4. Vision extraction for drawings/images through the AI provider; drawing-to-panel takeoff assistant (drafts only).
5. Calendar-aware OR-Tools model (working windows) and promotion from advisory to selectable scheduler.
6. Accuracy validation dataset from completed Paradigm events (see `ACCURACY_VALIDATION.md`).
