/**
 * Change impact analysis (spec §21) — compares two plans (baseline vs proposed) produced by
 * the same deterministic pipeline and summarises every affected domain and the approvals required.
 */
import { round } from "./trace";
import type { PlanResult } from "./pipeline";

export interface Delta { label: string; before: number | string | null; after: number | string | null; change: number | null; unit?: string }
export interface DomainImpact { domain: string; department: string; changed: boolean; deltas: Delta[]; notes: string[] }
export interface ChangeImpact {
  domains: DomainImpact[];
  approvalsRequired: string[];
  newIssues: string[];
  resolvedIssues: string[];
  newRisks: string[];
  summary: string;
}

const d = (label: string, before: number | null, after: number | null, unit?: string): Delta => ({ label, before, after, change: before != null && after != null ? round(after - before, 2) : null, unit });
const changed = (ds: Delta[]) => ds.some((x) => x.before !== x.after);

export function compareImpact(base: PlanResult, next: PlanResult): ChangeImpact {
  const domains: DomainImpact[] = [];

  const mats = new Set([...base.production.boq, ...next.production.boq].map((l) => l.code));
  const matDeltas = [...mats].sort().map((code) => {
    const a = base.production.boq.find((l) => l.code === code), b = next.production.boq.find((l) => l.code === code);
    return d(`${code} ${(a ?? b)!.name}`, a?.purchaseQuantity ?? 0, b?.purchaseQuantity ?? 0, (a ?? b)!.unit);
  }).filter((x) => x.change !== 0);
  domains.push({ domain: "Materials", department: "PRODUCTION", changed: matDeltas.length > 0, deltas: matDeltas, notes: [] });

  const trades = new Set([...base.trades, ...next.trades].map((t) => `${t.laborKey}|${t.phase}`));
  const labDeltas: Delta[] = [];
  for (const k of [...trades].sort()) {
    const a = base.trades.find((t) => `${t.laborKey}|${t.phase}` === k), b = next.trades.find((t) => `${t.laborKey}|${t.phase}` === k);
    const name = `${(a ?? b)!.name} (${(a ?? b)!.phase.toLowerCase()})`;
    const hh = d(`${name} hours`, a?.totalHours ?? 0, b?.totalHours ?? 0, "h");
    const cc = d(`${name} crew`, a?.requiredCrew ?? 0, b?.requiredCrew ?? 0, "persons");
    if (hh.change) labDeltas.push(hh);
    if (cc.change) labDeltas.push(cc);
  }
  domains.push({ domain: "Labour", department: "PMO", changed: labDeltas.length > 0, deltas: labDeltas, notes: next.trades.filter((t) => t.shortfall > 0).map((t) => `${t.name}: short by ${t.shortfall}`) });

  const avD = [d("Units to rent", sum(base.av.lines.map((l) => l.rental)), sum(next.av.lines.map((l) => l.rental)), "units"), d("AV power", base.av.totalPowerKw, next.av.totalPowerKw, "kW"), d("Technician hours", base.av.techHours, next.av.techHours, "h")];
  domains.push({ domain: "AV equipment", department: "AV", changed: changed(avD), deltas: avD, notes: [] });

  const logD = [d("Vehicles", base.logistics.trips.length, next.logistics.trips.length), d("Cargo weight", base.logistics.totals.weightKg, next.logistics.totals.weightKg, "kg"), d("Cargo volume", base.logistics.totals.volumeM3, next.logistics.totals.volumeM3, "m³"), d("Unassigned cargo", base.logistics.unassigned.length, next.logistics.unassigned.length)];
  const fleetA = base.logistics.trips.map((t) => t.vehicleCode).join(", "), fleetB = next.logistics.trips.map((t) => t.vehicleCode).join(", ");
  domains.push({ domain: "Transportation", department: "LOGISTICS", changed: changed(logD) || fleetA !== fleetB, deltas: logD, notes: fleetA !== fleetB ? [`Fleet: ${fleetA || "none"} → ${fleetB || "none"}`] : [] });

  const accD = [d("Rooms", base.accommodation.roomCount, next.accommodation.roomCount), d("Room nights", base.accommodation.roomNights, next.accommodation.roomNights)];
  domains.push({ domain: "Accommodation", department: "ACCOMMODATION", changed: changed(accD), deltas: accD, notes: [] });

  const finishA = base.schedule.projectFinish, finishB = next.schedule.projectFinish;
  const inspA = base.tasks.find((t) => t.key === "INSPECT")?.finish ?? null, inspB = next.tasks.find((t) => t.key === "INSPECT")?.finish ?? null;
  const schD = [
    d("Setup completion slack before event", inspA != null ? round((eventStart(base) - inspA) / 3600000, 1) : null, inspB != null ? round((eventStart(next) - inspB) / 3600000, 1) : null, "h"),
    d("Schedule conflicts", base.schedule.conflicts.filter((c) => c.severity === "error").length, next.schedule.conflicts.filter((c) => c.severity === "error").length),
    d("Critical tasks", base.schedule.criticalPath.length, next.schedule.criticalPath.length),
  ];
  domains.push({ domain: "Schedule", department: "PMO", changed: changed(schD) || finishA !== finishB, deltas: schD, notes: next.schedule.feasible ? [] : ["Proposed schedule is NOT feasible — see conflicts"] });

  const cur = new Set([...base.budget.byCurrency, ...next.budget.byCurrency].map((c) => c.currency));
  const budD = [...cur].sort().map((c) => d(`Total cost (${c})`, base.budget.byCurrency.find((x) => x.currency === c)?.total ?? 0, next.budget.byCurrency.find((x) => x.currency === c)?.total ?? 0, c));
  domains.push({ domain: "Budget", department: "FINANCE", changed: changed(budD), deltas: budD, notes: next.budget.variance != null && next.budget.variance < 0 ? ["Proposed plan exceeds budget"] : [] });

  const procD = [d("Procurement lines", base.procurement.length, next.procurement.length), d("Late orders", base.procurement.filter((p) => (p.slackDays ?? 1) < 0).length, next.procurement.filter((p) => (p.slackDays ?? 1) < 0).length)];
  domains.push({ domain: "Procurement", department: "PROCUREMENT", changed: changed(procD) || matDeltas.length > 0, deltas: procD, notes: [] });

  const riskD = [d("Risks", base.risks.length, next.risks.length), d("High/critical risks", base.risks.filter((r) => r.level === "HIGH" || r.level === "CRITICAL").length, next.risks.filter((r) => r.level === "HIGH" || r.level === "CRITICAL").length)];
  domains.push({ domain: "Risk", department: "PMO", changed: changed(riskD), deltas: riskD, notes: [] });

  const key = (i: { code: string; message: string }) => `${i.code}|${i.message}`;
  const baseIssues = new Set(base.issues.map(key)), nextIssues = new Set(next.issues.map(key));
  const newIssues = next.issues.filter((i) => !baseIssues.has(key(i)) && i.severity !== "info").map((i) => i.message);
  const resolvedIssues = base.issues.filter((i) => !nextIssues.has(key(i)) && i.severity !== "info").map((i) => i.message);
  const baseRisks = new Set(base.risks.map((r) => r.ruleKey));
  const newRisks = next.risks.filter((r) => !baseRisks.has(r.ruleKey)).map((r) => r.title);

  const approvals = new Set<string>();
  for (const dm of domains) if (dm.changed) approvals.add(dm.department);
  approvals.add("PMO");
  const changedNames = domains.filter((x) => x.changed).map((x) => x.domain);
  return {
    domains,
    approvalsRequired: [...approvals].sort(),
    newIssues, resolvedIssues, newRisks,
    summary: changedNames.length ? `Affects ${changedNames.join(", ")}. ${newIssues.length} new issue(s), ${resolvedIssues.length} resolved.` : "No calculated impact on resources, schedule or cost.",
  };
}

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const eventStart = (p: PlanResult) => p.tasks.find((t) => t.key === "EVENT:START")?.start ?? 0;
