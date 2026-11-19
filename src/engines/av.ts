/**
 * AV & technical planning engine (spec §10): inventory allocation, rental gaps,
 * power load, technician hours and AV cargo.
 */
import { ceilSafe, round, trace, type CalcTrace, type DataState, type Issue } from "./trace";
import type { EquipmentRequirementSnap, EquipmentSnap } from "./snapshot";

export interface AvLine {
  requirementId: string;
  description: string;
  category: string;
  equipmentCode: string | null;
  model: string | null;
  required: number;
  backup: number;
  total: number;
  ownedAvailable: number;
  allocated: number;
  rental: number;
  powerW: number | null;
  techHours: number | null;
  weightKg: number | null;
  volumeM3: number | null;
  rentalCost: number | null;
  currency: string;
  state: DataState;
  conflicts: string[];
}

export interface AvResult {
  lines: AvLine[];
  totalPowerKw: number;
  powerKnown: boolean;
  techHours: number;
  rentalDays: number;
  approvals: string[];
  traces: CalcTrace[];
  issues: Issue[];
}

const overlaps = (a0: Date, a1: Date, b0: Date, b1: Date) => a0 < b1 && b0 < a1;

export function planAv(reqs: EquipmentRequirementSnap[], equipment: EquipmentSnap[], window: { start: Date; end: Date }, venuePowerKw: number | null): AvResult {
  const eq = new Map(equipment.map((e) => [e.id, e]));
  const issues: Issue[] = [];
  const traces: CalcTrace[] = [];
  const lines: AvLine[] = [];
  const rentalDays = Math.max(1, ceilSafe((window.end.getTime() - window.start.getTime()) / 86400000));
  // allocate scarce stock across requirements of the same model deterministically
  const used = new Map<string, number>();
  for (const r of [...reqs].sort((a, b) => a.category.localeCompare(b.category) || a.description.localeCompare(b.description))) {
    const conflicts: string[] = [];
    const e = r.equipmentId ? eq.get(r.equipmentId) : undefined;
    const total = r.quantity + r.backupQuantity;
    if (!e) {
      issues.push({ severity: "error", code: "AV_MODEL_MISSING", department: "AV", subjectType: "EquipmentRequirement", subjectId: r.id, message: `AV requirement "${r.description}" has no equipment model selected`, question: `Which model is required for "${r.description}"?` });
      lines.push({ requirementId: r.id, description: r.description, category: r.category, equipmentCode: null, model: null, required: r.quantity, backup: r.backupQuantity, total, ownedAvailable: 0, allocated: 0, rental: 0, powerW: null, techHours: null, weightKg: null, volumeM3: null, rentalCost: null, currency: "EGP", state: "NEEDS_INFORMATION", conflicts });
      continue;
    }
    const elsewhere = e.allocatedElsewhere.filter((a) => overlaps(a.start, a.end, window.start, window.end));
    const elsewhereQty = elsewhere.reduce((s, a) => s + a.quantity, 0);
    elsewhere.forEach((a) => conflicts.push(`${a.quantity} × ${e.code} booked on ${a.projectCode}`));
    const owned = e.ownership === "OWNED" ? Math.max(0, e.ownedQty - e.outOfService - elsewhereQty - (used.get(e.id) ?? 0)) : 0;
    const allocated = Math.min(total, owned);
    used.set(e.id, (used.get(e.id) ?? 0) + allocated);
    const rental = total - allocated;
    const powerW = e.powerW != null ? e.powerW * r.quantity : null;
    const techHours = e.setupMinutes != null ? (e.setupMinutes * r.quantity) / 60 : null;
    if (e.powerW == null) issues.push({ severity: "warning", code: "AV_POWER_UNKNOWN", department: "AV", subjectId: r.id, message: `${e.code} ${e.model}: power consumption missing in equipment library` });
    if (e.setupMinutes == null) issues.push({ severity: "warning", code: "AV_SETUP_UNKNOWN", department: "AV", subjectId: r.id, message: `${e.code} ${e.model}: setup duration missing — technician hours not calculated` });
    if (e.weightKg == null || e.caseVolumeM3 == null) issues.push({ severity: "warning", code: "AV_CARGO_UNKNOWN", department: "AV", subjectId: r.id, message: `${e.code} ${e.model}: weight or packed volume missing — not included in transport calculation` });
    if (rental > 0) {
      issues.push({ severity: "warning", code: "AV_RENTAL_REQUIRED", department: "AV", subjectId: r.id, message: `${r.description}: ${rental} unit(s) of ${e.model} must be rented (owned stock available: ${owned})` });
      if (e.rentalDailyRate == null) issues.push({ severity: "warning", code: "AV_RENTAL_RATE_MISSING", department: "PROCUREMENT", subjectId: r.id, message: `${e.model}: rental rate unknown — request a quotation` });
    }
    const rentalCost = rental > 0 && e.rentalDailyRate != null ? round(rental * e.rentalDailyRate * rentalDays, 2) : rental > 0 ? null : 0;
    traces.push(trace({
      engine: "av.allocation", title: `AV allocation — ${r.description}`, subjectType: "EquipmentRequirement", subjectId: r.id,
      formula: "Allocated = MIN(required + backup, owned − out of service − booked elsewhere); Rental = total − allocated; Power = qty × W; Tech hours = qty × setup min ÷ 60",
      inputs: { required: r.quantity, backup: r.backupQuantity, owned: e.ownedQty, outOfService: e.outOfService, bookedElsewhere: elsewhereQty, powerW: e.powerW, setupMinutes: e.setupMinutes, rentalDays, rentalDailyRate: e.rentalDailyRate },
      outputs: { allocated, rental, powerW, techHours, rentalCost },
      assumptions: ["Backup units are transported but not powered", `Rental period ${rentalDays} day(s): setup start to dismantle end`],
      units: "units", state: "CALCULATED",
    }));
    lines.push({
      requirementId: r.id, description: r.description, category: r.category, equipmentCode: e.code, model: e.model,
      required: r.quantity, backup: r.backupQuantity, total, ownedAvailable: owned, allocated, rental,
      powerW, techHours: techHours == null ? null : round(techHours, 2),
      weightKg: e.weightKg == null ? null : round(e.weightKg * total, 1), volumeM3: e.caseVolumeM3 == null ? null : round(e.caseVolumeM3 * total, 3),
      rentalCost, currency: e.currency, state: "CALCULATED", conflicts,
    });
  }
  const powerKnown = lines.every((l) => l.powerW != null);
  const totalPowerKw = round(lines.reduce((s, l) => s + (l.powerW ?? 0), 0) / 1000, 2);
  const techHours = round(lines.reduce((s, l) => s + (l.techHours ?? 0), 0), 2);
  traces.push(trace({ engine: "av.power", title: "AV power load", formula: "Σ quantity × rated power (W) ÷ 1000", inputs: { lines: lines.map((l) => ({ d: l.description, w: l.powerW })) }, outputs: { totalPowerKw, venuePowerKw }, assumptions: ["Rated (maximum) power, no diversity factor applied", "Electrical design must be approved by a qualified electrician"], units: "kW", state: powerKnown ? "CALCULATED" : "ESTIMATED" }));
  if (venuePowerKw == null) issues.push({ severity: "warning", code: "VENUE_POWER_UNKNOWN", department: "AV", message: `Venue power capacity unknown — AV load is ${totalPowerKw} kW`, question: "What is the available power capacity (kW) at the venue and the connection type?" });
  else if (totalPowerKw > venuePowerKw) issues.push({ severity: "error", code: "VENUE_POWER_EXCEEDED", department: "AV", message: `AV power load ${totalPowerKw} kW exceeds venue capacity ${venuePowerKw} kW — generator or load reduction required` });
  const approvals: string[] = [];
  if (lines.some((l) => ["TRUSS", "RIGGING"].includes(l.category))) approvals.push("Rigging plan approval by a certified rigger / structural engineer");
  if (totalPowerKw > 0) approvals.push("Electrical distribution approval by a qualified electrician");
  if (lines.some((l) => l.category === "LED_SCREEN")) approvals.push("LED wall structure & weight-load approval");
  return { lines, totalPowerKw, powerKnown, techHours, rentalDays, approvals, traces, issues };
}
