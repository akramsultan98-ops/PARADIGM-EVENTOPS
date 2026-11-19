/**
 * Scheduling engine (spec §18).
 *  1. Topological ordering with cycle detection.
 *  2. Calendar-aware CPM forward/backward pass (FS/SS/FF/SF + lag) → ES/EF/LS/LF, float, critical path.
 *  3. Resource-constrained serial schedule generation (priority = least late start) that delays
 *     tasks until crew capacity is free.
 *  4. Conflicts: deadline violations, calendar overflow, over-capacity demands, fixed-date clashes.
 * Required tasks are NEVER dropped — infeasibility is reported with explanations.
 * Advanced optimisation (OR-Tools CP-SAT) can replace step 3 via the optimizer adapter.
 */
import { Calendar, HOUR_MS } from "./calendar";

export type DepType = "FS" | "SS" | "FF" | "SF";

export interface SchedTask {
  id: string;
  name: string;
  durationHours: number;
  calendar: Calendar;
  /** earliest permitted start (ms) */
  release?: number;
  /** finish must not be later than this (ms) */
  deadline?: number;
  deadlineLabel?: string;
  /** pinned start, e.g. event milestones */
  fixedStart?: number;
  resource?: { key: string; units: number };
  isMilestone?: boolean;
}

export interface SchedDep { from: string; to: string; type: DepType; lagHours: number }

export interface Conflict {
  type: "DEADLINE" | "CALENDAR_OVERFLOW" | "CAPACITY" | "CYCLE" | "FIXED_DATE" | "RESOURCE_DELAY";
  taskId?: string;
  severity: "warning" | "error";
  message: string;
  hours?: number;
}

export interface ScheduledTask {
  id: string;
  start: number | null;
  finish: number | null;
  es: number | null;
  ef: number | null;
  ls: number | null;
  lf: number | null;
  floatHours: number | null;
  critical: boolean;
  resourceDelayHours: number;
}

export interface ScheduleResult {
  tasks: ScheduledTask[];
  order: string[];
  criticalPath: string[];
  projectStart: number | null;
  projectFinish: number | null;
  makespanHours: number | null;
  conflicts: Conflict[];
  feasible: boolean;
  method: "CPM_SGS";
}

const fmt = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";

export function topoSort(ids: string[], deps: SchedDep[]): { order: string[]; cycle: string[] | null } {
  const indeg = new Map(ids.map((i) => [i, 0]));
  const succ = new Map<string, string[]>(ids.map((i) => [i, []]));
  for (const d of deps) {
    if (!indeg.has(d.from) || !indeg.has(d.to)) continue;
    indeg.set(d.to, indeg.get(d.to)! + 1);
    succ.get(d.from)!.push(d.to);
  }
  const queue = ids.filter((i) => indeg.get(i) === 0).sort();
  const order: string[] = [];
  while (queue.length) {
    const n = queue.shift()!;
    order.push(n);
    for (const s of succ.get(n)!.sort()) {
      indeg.set(s, indeg.get(s)! - 1);
      if (indeg.get(s) === 0) { queue.push(s); queue.sort(); }
    }
  }
  if (order.length !== ids.length) return { order, cycle: ids.filter((i) => !order.includes(i)) };
  return { order, cycle: null };
}

function earliestStart(t: SchedTask, preds: SchedDep[], startOf: Map<string, number>, finishOf: Map<string, number>, anchor: number): number {
  let est = t.release ?? anchor;
  for (const d of preds) {
    const ps = startOf.get(d.from), pf = finishOf.get(d.from);
    if (ps === undefined || pf === undefined) continue;
    const lag = d.lagHours * HOUR_MS;
    let c: number;
    switch (d.type) {
      case "FS": c = pf + lag; break;
      case "SS": c = ps + lag; break;
      case "FF": c = t.calendar.subtractWork(pf + lag, t.durationHours); break;
      case "SF": c = t.calendar.subtractWork(ps + lag, t.durationHours); break;
    }
    est = Math.max(est, c);
  }
  return est;
}

export function schedule(tasks: SchedTask[], deps: SchedDep[], capacities: Record<string, number>, anchor: number): ScheduleResult {
  const conflicts: Conflict[] = [];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const validDeps = deps.filter((d) => byId.has(d.from) && byId.has(d.to));
  const { order, cycle } = topoSort(tasks.map((t) => t.id).sort(), validDeps);
  if (cycle) {
    conflicts.push({ type: "CYCLE", severity: "error", message: `Circular dependency between: ${cycle.map((c) => byId.get(c)!.name).join(", ")}` });
    return { tasks: tasks.map((t) => ({ id: t.id, start: null, finish: null, es: null, ef: null, ls: null, lf: null, floatHours: null, critical: false, resourceDelayHours: 0 })), order, criticalPath: [], projectStart: null, projectFinish: null, makespanHours: null, conflicts, feasible: false, method: "CPM_SGS" };
  }
  const predsOf = new Map<string, SchedDep[]>(tasks.map((t) => [t.id, []]));
  const succsOf = new Map<string, SchedDep[]>(tasks.map((t) => [t.id, []]));
  validDeps.forEach((d) => { predsOf.get(d.to)!.push(d); succsOf.get(d.from)!.push(d); });

  const place = (t: SchedTask, est: number) => {
    if (t.fixedStart !== undefined) {
      if (est > t.fixedStart + 1) conflicts.push({ type: "FIXED_DATE", taskId: t.id, severity: "error", message: `"${t.name}" is fixed at ${fmt(t.fixedStart)} but its predecessors only allow ${fmt(est)} (${((est - t.fixedStart) / HOUR_MS).toFixed(1)} h late)`, hours: (est - t.fixedStart) / HOUR_MS });
      return { s: t.fixedStart, f: t.calendar.addWork(t.fixedStart, t.durationHours) };
    }
    const s = t.durationHours > 0 ? t.calendar.nextWorking(est) : est;
    return { s, f: s === Infinity ? Infinity : t.calendar.addWork(s, t.durationHours) };
  };

  // ── CPM forward pass (resource-unconstrained) ──
  const ES = new Map<string, number>(), EF = new Map<string, number>();
  for (const id of order) {
    const t = byId.get(id)!;
    const conflictsBefore = conflicts.length;
    const { s, f } = place(t, earliestStart(t, predsOf.get(id)!, ES, EF, anchor));
    conflicts.length = conflictsBefore; // fixed-date conflicts are reported from the leveled pass
    ES.set(id, s); EF.set(id, f);
  }
  const finite = [...EF.values()].filter(Number.isFinite);
  const cpmEnd = finite.length ? Math.max(...finite) : anchor;

  // ── backward pass ──
  const LS = new Map<string, number>(), LF = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const t = byId.get(id)!;
    const elapsed = (EF.get(id)! - ES.get(id)!) || 0;
    let lf = cpmEnd;
    for (const d of succsOf.get(id)!) {
      const lag = d.lagHours * HOUR_MS;
      const sLS = LS.get(d.to)!, sLF = LF.get(d.to)!;
      switch (d.type) {
        case "FS": lf = Math.min(lf, sLS - lag); break;
        case "SS": lf = Math.min(lf, sLS - lag + elapsed); break;
        case "FF": lf = Math.min(lf, sLF - lag); break;
        case "SF": lf = Math.min(lf, sLF - lag + elapsed); break;
      }
    }
    LF.set(id, lf);
    LS.set(id, t.fixedStart !== undefined ? t.fixedStart : Number.isFinite(lf) ? t.calendar.subtractWork(lf, t.durationHours) : lf);
  }

  // ── resource-constrained serial SGS ──
  const S = new Map<string, number>(), F = new Map<string, number>();
  const delay = new Map<string, number>();
  const scheduled = new Set<string>();
  const remainingPreds = new Map(tasks.map((t) => [t.id, predsOf.get(t.id)!.length]));
  const usage: { key: string; units: number; s: number; f: number }[] = [];
  while (scheduled.size < tasks.length) {
    const eligible = order.filter((id) => !scheduled.has(id) && remainingPreds.get(id) === 0);
    eligible.sort((a, b) => (LS.get(a)! - LS.get(b)!) || a.localeCompare(b));
    const id = eligible[0];
    const t = byId.get(id)!;
    const est = earliestStart(t, predsOf.get(id)!, S, F, anchor);
    let { s, f } = place(t, est);
    const baseStart = s;
    if (t.resource && t.fixedStart === undefined && Number.isFinite(s)) {
      const cap = capacities[t.resource.key];
      if (cap === undefined || t.resource.units > cap) {
        conflicts.push({ type: "CAPACITY", taskId: id, severity: "error", message: `"${t.name}" needs ${t.resource.units} × ${t.resource.key} but only ${cap ?? 0} are available` });
      } else {
        const sameRes = usage.filter((u) => u.key === t.resource!.key);
        const candidates = [s, ...sameRes.map((u) => u.f).filter((x) => x > s)].sort((a, b) => a - b);
        for (const c of candidates) {
          const cs = t.calendar.nextWorking(c);
          const cf = t.calendar.addWork(cs, t.durationHours);
          if (!Number.isFinite(cf)) { s = cs; f = cf; break; }
          // peak usage over [cs, cf): check at every start point inside the window
          const points = [cs, ...sameRes.map((u) => u.s).filter((p) => p > cs && p < cf)];
          const ok = points.every((p) => sameRes.filter((u) => u.s <= p && u.f > p).reduce((sum, u) => sum + u.units, 0) + t.resource!.units <= cap);
          if (ok) { s = cs; f = cf; break; }
        }
      }
    }
    if (t.resource && Number.isFinite(f)) usage.push({ key: t.resource.key, units: t.resource.units, s, f });
    S.set(id, s); F.set(id, f);
    const d = Number.isFinite(s) && Number.isFinite(baseStart) ? (s - baseStart) / HOUR_MS : 0;
    delay.set(id, d);
    if (d > 0.01) conflicts.push({ type: "RESOURCE_DELAY", taskId: id, severity: "warning", message: `"${t.name}" delayed ${d.toFixed(1)} h waiting for ${t.resource!.key} crew`, hours: d });
    scheduled.add(id);
    for (const dep of succsOf.get(id)!) remainingPreds.set(dep.to, remainingPreds.get(dep.to)! - 1);
  }

  for (const t of tasks) {
    const f = F.get(t.id)!;
    if (!Number.isFinite(f)) {
      conflicts.push({ type: "CALENDAR_OVERFLOW", taskId: t.id, severity: "error", message: `"${t.name}" cannot be completed within the available working calendar (${t.calendar.name})` });
    } else if (t.deadline !== undefined && f > t.deadline + 60000) {
      const late = (f - t.deadline) / HOUR_MS;
      conflicts.push({ type: "DEADLINE", taskId: t.id, severity: "error", message: `"${t.name}" finishes ${late.toFixed(1)} h after ${t.deadlineLabel ?? "its deadline"} (${fmt(t.deadline)})`, hours: late });
    }
  }

  const out: ScheduledTask[] = tasks.map((t) => {
    const es = ES.get(t.id)!, ls = LS.get(t.id)!;
    const flt = Number.isFinite(es) && Number.isFinite(ls) ? (ls - es) / HOUR_MS : null;
    const fin = (n: number | undefined) => (n !== undefined && Number.isFinite(n) ? n : null);
    return { id: t.id, start: fin(S.get(t.id)), finish: fin(F.get(t.id)), es: fin(es), ef: fin(EF.get(t.id)), ls: fin(ls), lf: fin(LF.get(t.id)), floatHours: flt === null ? null : Math.round(flt * 100) / 100, critical: flt !== null && flt <= 0.01, resourceDelayHours: Math.round((delay.get(t.id) ?? 0) * 100) / 100 };
  });
  const starts = out.map((t) => t.start).filter((x): x is number => x !== null);
  const finishes = out.map((t) => t.finish).filter((x): x is number => x !== null);
  const projectStart = starts.length ? Math.min(...starts) : null;
  const projectFinish = finishes.length ? Math.max(...finishes) : null;
  return {
    tasks: out,
    order,
    criticalPath: order.filter((id) => out.find((t) => t.id === id)!.critical),
    projectStart,
    projectFinish,
    makespanHours: projectStart !== null && projectFinish !== null ? Math.round(((projectFinish - projectStart) / HOUR_MS) * 100) / 100 : null,
    conflicts,
    feasible: !conflicts.some((c) => c.severity === "error"),
    method: "CPM_SGS",
  };
}
