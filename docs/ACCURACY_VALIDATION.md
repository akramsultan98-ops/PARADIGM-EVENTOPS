# Accuracy validation

The business goal is very high planning accuracy (target 99% where data and calculation type permit). **No accuracy figure is claimed today**: the platform has not yet been validated against a representative set of completed Paradigm events.

## What the system guarantees now
- **Determinism**: identical approved inputs produce identical outputs (unit test `is reproducible for identical inputs`; integration test on persisted snapshots via input hashes).
- **Arithmetic correctness** of each engine against hand-calculated cases (69 unit tests: cutting with kerf/trim/grain/oversize, timber kerf, paint litres & containers, crew ceiling & overtime, AV gaps & power, packing weight/volume/length, room nights & conflicts, currency separation, CPM/SS/FF/SF, resource levelling, deadline conflicts).
- **Honesty of state**: values without approved inputs are `ESTIMATED` or `NEEDS_INFORMATION`; demo standards are `DEMO`.

## What accuracy depends on
Approved material dimensions/waste, approved productivity rates, correct drawings (panel & member schedules), packed volumes, route durations, equipment specs. Engine accuracy cannot exceed input accuracy.

## Measurement method (implemented)
`Actual vs planned` (Live Execution) computes per row: `variance = actual − planned`, `variance % = variance ÷ planned`, `accuracy % = max(0, 100 − |variance %|)`, aggregated per category group (Materials, Labour, Transportation, Duration, Cost) with "within ±5%" counts. Failed estimates are displayed, not hidden. Sheet 18 of the workbook exports the same data. Historical events (imported) show planned vs actual of past projects.

## Validation plan
1. Import ≥ 20 completed Paradigm events (planned and actual quantities, hours, durations, costs) via Knowledge Base → Import → Historical events.
2. For each category compute mean absolute percentage error (MAPE), bias (mean signed error) and P90 absolute error.
3. Accept a category for "high-accuracy" claims only when MAPE and P90 meet agreed thresholds on a hold-out set.
4. Recalibrate standards (productivity, waste) through **standards proposals** approved by the Super Admin — never automatically. Re-measure after each change.
5. Record results and dataset version in this document.

| Category | Dataset | MAPE | Bias | P90 | Status |
|---|---|---|---|---|---|
| Materials | — | — | — | — | Not validated |
| Labour hours | — | — | — | — | Not validated |
| Durations | — | — | — | — | Not validated |
| Transportation | — | — | — | — | Not validated |
| Cost | — | — | — | — | Not validated |

The demo project's actual-vs-planned figures are **synthetic demo values** and must not be used as evidence of accuracy.
