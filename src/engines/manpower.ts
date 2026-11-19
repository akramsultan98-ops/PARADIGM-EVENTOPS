/**
 * Manpower planning engine (spec §9).
 *   Labour hours  = Σ workload quantity × approved productivity (hours per unit)
 *   Required crew = CEILING(Total labour hours ÷ productive hours per person in the phase window)
 * Missing productivity rates are reported as NEEDS_INFORMATION — never invented.
 */
import { ceilSafe, round, trace, type CalcTrace, type DataState, type Issue } from "./trace";
import type { LaborCategorySnap, OperationKey, Standards } from "./snapshot";
import type { Workload } from "./production/boq";

export type LaborPhase = "WORKSHOP" | "LOADOUT" | "SITE" | "DISMANTLE";

export const OPERATION_PHASE: Record<OperationKey, LaborPhase> = {
  PANEL_FABRICATION: "WORKSHOP",
  FRAME_ASSEMBLY: "WORKSHOP",
  PAINTING: "WORKSHOP",
  LOADING: "LOADOUT",
  UNLOADING: "SITE",
  INSTALLATION: "SITE",
  BRANDING_INSTALL: "SITE",
  DISMANTLE: "DISMANTLE",
};

export interface DirectHours { key: string; laborKey: string; phase: LaborPhase; hours: number; basis: string }

export interface LaborDemand {
  key: string;
  laborKey: string;
  phase: LaborPhase;
  operation: string;
  quantity: number | null;
  unit: string | null;
  hoursPerUnit: number | null;
  hours: number | null;
  basis: string;
  itemCode?: string;
  state: DataState;
  traceIndex: number;
}

export interface PhaseWindow { days: number; productiveHoursPerDay: number | null; label: string }

export interface TradePlan {
  laborKey: string;
  name: string;
  phase: LaborPhase;
  totalHours: number;
  productiveHoursPerPerson: number;
  windowDays: number;
  requiredCrew: number;
  available: number;
  shortfall: number;
  crewWithOvertime: number | null;
  estimatedCost: number | null;
  currency: string;
  state: DataState;
  traceIndex: number;
}

export function computeLaborDemands(workloads: Workload[], direct: DirectHours[], cats: LaborCategorySnap[], standards: Standards) {
  const traces: CalcTrace[] = [];
  const issues: Issue[] = [];
  const demands: LaborDemand[] = [];
  const byKey = new Map(cats.map((c) => [c.key, c]));

  for (const w of workloads) {
    const map = standards.activityMap[w.operation];
    const cat = byKey.get(map.laborKey);
    const rate = cat?.rates.find((r) => r.activity === map.activity);
    if (!cat || !rate) {
      issues.push({
        severity: "error", code: "LABOR_RATE_MISSING", department: "PRODUCTION",
        message: `No approved productivity rate for ${map.laborKey} / ${map.activity} — ${w.key} labour hours cannot be calculated`,
        question: `Please ask the company standards administrator to provide the ${map.laborKey.toLowerCase()} productivity for ${map.activity.toLowerCase().replace(/_/g, " ")} (hours per ${map.unit}).`,
      });
      demands.push({ key: w.key, laborKey: map.laborKey, phase: OPERATION_PHASE[w.operation], operation: w.operation, quantity: w.quantity, unit: w.unit, hoursPerUnit: null, hours: null, basis: w.basis, itemCode: w.itemCode, state: "NEEDS_INFORMATION", traceIndex: -1 });
      continue;
    }
    if (rate.unitOfWork !== w.unit) {
      issues.push({ severity: "error", code: "LABOR_UNIT_MISMATCH", message: `${w.key}: workload in ${w.unit} but productivity rate is per ${rate.unitOfWork}` });
      continue;
    }
    const hours = w.quantity * rate.hoursPerUnit;
    const state: DataState = rate.status === "APPROVED" ? "CALCULATED" : "ESTIMATED";
    traces.push(trace({
      engine: "manpower.hours", title: `Labour hours — ${w.key}`, subjectType: "Workload", subjectId: w.key,
      formula: "Hours = Quantity × Productivity (h/unit)",
      inputs: { quantity: w.quantity, unit: w.unit, hoursPerUnit: rate.hoursPerUnit, trade: cat.key, activity: rate.activity },
      outputs: { hours: round(hours, 2) },
      assumptions: [w.basis, rate.status === "APPROVED" ? "Approved company productivity rate" : `Productivity rate status: ${rate.status} (not an approved company standard)`],
      units: "labour-hours", state,
    }));
    demands.push({ key: w.key, laborKey: cat.key, phase: OPERATION_PHASE[w.operation], operation: w.operation, quantity: w.quantity, unit: w.unit, hoursPerUnit: rate.hoursPerUnit, hours: round(hours, 2), basis: w.basis, itemCode: w.itemCode, state, traceIndex: traces.length - 1 });
  }
  for (const d of direct) {
    traces.push(trace({ engine: "manpower.hours", title: `Labour hours — ${d.key}`, subjectId: d.key, formula: d.basis, inputs: { ...d }, outputs: { hours: d.hours }, assumptions: [], units: "labour-hours", state: "CALCULATED" }));
    demands.push({ key: d.key, laborKey: d.laborKey, phase: d.phase, operation: "DIRECT", quantity: null, unit: null, hoursPerUnit: null, hours: round(d.hours, 2), basis: d.basis, state: "CALCULATED", traceIndex: traces.length - 1 });
  }
  return { demands, traces, issues };
}

export function computeCrews(demands: LaborDemand[], cats: LaborCategorySnap[], windows: Record<LaborPhase, PhaseWindow>) {
  const traces: CalcTrace[] = [];
  const issues: Issue[] = [];
  const plans: TradePlan[] = [];
  const byKey = new Map(cats.map((c) => [c.key, c]));
  const groups = new Map<string, LaborDemand[]>();
  for (const d of demands) {
    if (d.hours == null) continue;
    const k = `${d.laborKey}|${d.phase}`;
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  for (const [k, list] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const [laborKey, phase] = k.split("|") as [string, LaborPhase];
    const cat = byKey.get(laborKey);
    const win = windows[phase];
    const totalHours = list.reduce((s, d) => s + (d.hours ?? 0), 0);
    if (!cat) {
      issues.push({ severity: "error", code: "LABOR_CATEGORY_MISSING", message: `Labour category ${laborKey} is not in the labour library` });
      continue;
    }
    const perDay = Math.min(cat.dailyHours - cat.breakHours, win.productiveHoursPerDay ?? Infinity);
    const perPerson = perDay * win.days;
    if (perPerson <= 0) {
      issues.push({ severity: "error", code: "WINDOW_EMPTY", message: `${phase} window for ${cat.name} has no working time (${win.label}) — ${round(totalHours, 1)} h cannot be scheduled`, department: "PMO" });
      plans.push({ laborKey, name: cat.name, phase, totalHours: round(totalHours, 2), productiveHoursPerPerson: 0, windowDays: win.days, requiredCrew: 0, available: cat.headcount, shortfall: 0, crewWithOvertime: null, estimatedCost: null, currency: cat.currency, state: "NEEDS_INFORMATION", traceIndex: -1 });
      continue;
    }
    const required = Math.max(1, ceilSafe(totalHours / perPerson));
    const shortfall = Math.max(0, required - cat.headcount);
    const otPerPerson = (perDay + cat.maxOvertimeHours) * win.days;
    const crewWithOT = shortfall > 0 ? ceilSafe(totalHours / otPerPerson) : null;
    const daysWorked = Math.min(win.days, Math.max(1, ceilSafe(totalHours / (required * perDay))));
    const cost = cat.dailyRate != null ? round(required * daysWorked * cat.dailyRate, 2) : null;
    const state: DataState = list.some((d) => d.state === "ESTIMATED") || cat.status !== "APPROVED" ? "ESTIMATED" : "CALCULATED";
    traces.push(trace({
      engine: "manpower.crew", title: `Crew — ${cat.name} (${phase.toLowerCase()})`, subjectType: "LaborCategory", subjectId: cat.id,
      formula: "Required crew = CEILING(Total labour hours ÷ (productive h/day × working days))",
      inputs: { totalHours: round(totalHours, 2), productiveHoursPerDay: perDay, windowDays: win.days, window: win.label, headcount: cat.headcount, dailyRate: cat.dailyRate },
      outputs: { requiredCrew: required, shortfall, crewWithOvertime: crewWithOT, daysWorked, cost },
      assumptions: [`Productive hours/day = ${cat.dailyHours} h shift − ${cat.breakHours} h breaks${win.productiveHoursPerDay != null ? `, capped by access window ${win.productiveHoursPerDay} h` : ""}`, `Window: ${win.label}`],
      units: "persons", state,
    }));
    if (shortfall > 0) {
      issues.push({
        severity: "error", code: "MANPOWER_SHORTFALL", department: "PMO",
        message: `${cat.name}: ${required} required in ${phase.toLowerCase()} window but only ${cat.headcount} available (short by ${shortfall})${crewWithOT != null && crewWithOT <= cat.headcount ? ` — feasible with up to ${cat.maxOvertimeHours} h overtime/day using ${crewWithOT}` : ""}`,
      });
    }
    plans.push({ laborKey, name: cat.name, phase, totalHours: round(totalHours, 2), productiveHoursPerPerson: round(perPerson, 2), windowDays: win.days, requiredCrew: required, available: cat.headcount, shortfall, crewWithOvertime: crewWithOT, estimatedCost: cost, currency: cat.currency, state, traceIndex: traces.length - 1 });
  }
  return { plans, traces, issues };
}
