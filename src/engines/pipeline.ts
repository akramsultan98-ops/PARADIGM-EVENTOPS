/**
 * Integrated planning pipeline — the deterministic core behind the AI orchestrator.
 *
 *   snapshot → production BOQ → AV allocation → cargo & fleet → phase windows
 *            → labour hours & crews → WBS tasks → calendar-aware schedule
 *            → procurement dates → budget → risks → readiness summary
 *
 * Pure function: identical snapshots always produce identical plans (tested).
 */
import { calculateProduction, type ProductionResult } from "./production/boq";
import { planAv, type AvResult } from "./av";
import { planTransport, type CargoLine, type LogisticsResult } from "./logistics";
import { computeCrews, computeLaborDemands, type DirectHours, type LaborDemand, type LaborPhase, type PhaseWindow, type TradePlan } from "./manpower";
import { planAccommodation, type AccommodationResult } from "./accommodation";
import { computeBudget, type BudgetResult, type CostLine } from "./budget";
import { Calendar, HOUR_MS } from "./scheduling/calendar";
import { schedule, type Conflict, type ScheduleResult, type SchedDep, type SchedTask } from "./scheduling/scheduler";
import { generateRisks, type RiskOut } from "./risk";
import { ceilSafe, round, trace, type CalcTrace, type DataState, type Issue } from "./trace";
import type { ProjectSnapshot } from "./snapshot";

export interface PlannedTask {
  key: string;
  wbsCode: string;
  name: string;
  phase: "ADMIN" | "PROCUREMENT" | "PRODUCTION" | "TRANSPORT" | "SETUP" | "EVENT" | "DISMANTLE";
  department: string;
  laborKey: string | null;
  crewSize: number | null;
  laborHours: number | null;
  durationHours: number;
  durationState: DataState;
  location: string;
  isMilestone: boolean;
  sourceType: string | null;
  sourceId: string | null;
  deadline: number | null;
  start: number | null;
  finish: number | null;
  floatHours: number | null;
  critical: boolean;
  resourceDelayHours: number;
}

export interface ProcurementLine {
  key: string;
  item: string;
  materialId: string | null;
  quantity: number;
  unit: string;
  inStock: number | null;
  requiredBy: number | null;
  leadTimeDays: number | null;
  orderBy: number | null;
  slackDays: number | null;
  vendor: string | null;
  unitPrice: number | null;
  currency: string;
  amount: number | null;
  type: "PURCHASE" | "RENTAL" | "PRINT";
  state: DataState;
}

export interface PlanResult {
  generatedAt: string;
  inputHash: string;
  production: ProductionResult;
  av: AvResult;
  cargo: CargoLine[];
  logistics: LogisticsResult;
  windows: Record<LaborPhase, PhaseWindow>;
  laborDemands: LaborDemand[];
  trades: TradePlan[];
  tasks: PlannedTask[];
  dependencies: { from: string; to: string; type: "FS" | "SS" | "FF" | "SF"; lagHours: number }[];
  schedule: Omit<ScheduleResult, "tasks">;
  procurement: ProcurementLine[];
  accommodation: AccommodationResult;
  budget: BudgetResult;
  risks: RiskOut[];
  issues: Issue[];
  traces: CalcTrace[];
  readiness: {
    errors: number;
    warnings: number;
    questions: { department: string; question: string; code: string }[];
    byDepartment: Record<string, { errors: number; warnings: number }>;
    feasible: boolean;
    overallState: DataState;
  };
}

const DAY = 24 * HOUR_MS;

function parseHour(hhmm: string | null, fallback: number) {
  if (!hhmm) return fallback;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) + Number(m[2]) / 60 : fallback;
}

/** local midnight of the day containing t */
function localDayStart(t: number, tz: number) {
  const local = t + tz * HOUR_MS;
  return local - (local % DAY) - tz * HOUR_MS;
}

export function runPlanningPipeline(snap: ProjectSnapshot): PlanResult {
  const st = snap.standards;
  const tz = st.timezoneOffsetHours;
  const p = snap.project;
  const issues: Issue[] = [];
  const traces: CalcTrace[] = [];
  const asOf = snap.asOf.getTime();

  // ── basic project validation ──
  if (p.setupStart >= p.eventStart) issues.push({ severity: "error", code: "DATES_SETUP_AFTER_EVENT", department: "PMO", message: "Setup start is not before event start" });
  if (p.eventEnd <= p.eventStart) issues.push({ severity: "error", code: "DATES_EVENT", department: "PMO", message: "Event end is not after event start" });
  if (p.setupStart.getTime() < asOf) issues.push({ severity: "warning", code: "DATES_PAST", department: "PMO", message: "Setup start date is in the past relative to the plan date" });

  // ── 1. production ──
  const production = calculateProduction(snap.productionItems, snap.materials, st);
  const prodOffset = traces.length;
  traces.push(...production.traces);
  issues.push(...production.issues);

  // ── 2. AV ──
  const avWindowEnd = p.dismantleEnd ?? new Date(p.eventEnd.getTime() + DAY);
  const av = planAv(snap.equipmentRequirements, snap.equipment, { start: p.setupStart, end: avWindowEnd }, snap.venue?.powerCapacityKw ?? null);
  traces.push(...av.traces);
  issues.push(...av.issues);

  // ── 3. cargo ──
  const cargo: CargoLine[] = [];
  for (const m of production.items) {
    const item = snap.productionItems.find((i) => i.id === m.itemId)!;
    const q = Math.max(1, item.quantity);
    cargo.push({ key: `PROD:${m.code}`, sourceType: "PRODUCTION", name: `${m.code} ${m.name}`, quantity: q, unitWeightKg: m.weightKg == null ? null : round(m.weightKg / q, 2), unitVolumeM3: m.transportVolumeM3 == null ? null : round(m.transportVolumeM3 / q, 4), maxDimM: m.longestComponentM, fragile: false });
  }
  for (const l of av.lines) {
    if (!l.equipmentCode) continue;
    cargo.push({ key: `AV:${l.equipmentCode}:${l.requirementId.slice(-4)}`, sourceType: "EQUIPMENT", name: `${l.model} (${l.total})`, quantity: l.total, unitWeightKg: l.weightKg == null ? null : round(l.weightKg / l.total, 2), unitVolumeM3: l.volumeM3 == null ? null : round(l.volumeM3 / l.total, 4), maxDimM: null, fragile: true });
  }
  for (const c of snap.extraCargo) {
    const vol = c.unitVolumeM3 ?? (c.lengthM != null && c.widthM != null && c.heightM != null ? c.lengthM * c.widthM * c.heightM : null);
    cargo.push({ key: `CARGO:${c.id.slice(-6)}`, sourceType: c.sourceType, name: c.name, quantity: c.quantity, unitWeightKg: c.unitWeightKg, unitVolumeM3: vol == null ? null : round(vol, 4), maxDimM: c.lengthM != null ? Math.max(c.lengthM, c.widthM ?? 0, c.heightM ?? 0) : null, fragile: c.fragile });
  }
  const destination = snap.venue?.city ?? p.location;
  const logistics = planTransport(cargo, snap.vehicles, {
    fillFactor: st.vehicleFillFactor,
    window: { start: new Date(p.setupStart.getTime() - 2 * DAY), end: avWindowEnd },
    origin: p.originCity, destination, routes: snap.routes, driversAvailable: snap.driversAvailable,
  });
  traces.push(...logistics.traces);
  issues.push(...logistics.issues);
  const routeHours = logistics.route?.durationHours ?? null;

  // ── 4. calendars and phase windows ──
  const accessOpen = parseHour(snap.venue?.accessOpens ?? null, st.siteDayStart);
  const accessClose = parseHour(snap.venue?.accessCloses ?? null, st.siteDayEnd);
  const horizonEnd = new Date(avWindowEnd.getTime() + 14 * DAY);
  const workshopCal = Calendar.daily("Workshop", snap.asOf, horizonEnd, st.workshopDayStart, st.workshopDayEnd, tz, st.workshopWorkdays);
  const siteCal = Calendar.daily(`Venue access ${accessOpen}:00–${accessClose}:00`, p.setupStart, horizonEnd, accessOpen, accessClose, tz);
  const continuous = Calendar.continuous("Continuous (travel / supplier lead time)");

  const loadingVolume = logistics.totals.volumeM3;
  // latest departure so trucks arrive at setup start; workshop must finish before load-out
  const latestDeparture = p.setupStart.getTime() - (routeHours ?? 0) * HOUR_MS;
  const workshopWindowEnd = localDayStart(latestDeparture, tz); // load-out happens on the departure day
  const workshopDays = new Set(workshopCal.intervals.filter((iv) => iv.end <= workshopWindowEnd && iv.start >= asOf).map((iv) => new Date(iv.start).toISOString().slice(0, 10))).size;
  const siteHoursPerDay = accessClose - accessOpen;
  const setupMs = p.eventStart.getTime() - st.setupBufferHours * HOUR_MS - p.setupStart.getTime();
  const siteDays = Math.max(0, siteCal.workBetween(p.setupStart.getTime(), p.eventStart.getTime() - st.setupBufferHours * HOUR_MS) / siteHoursPerDay);
  const windows: Record<LaborPhase, PhaseWindow> = {
    WORKSHOP: { days: workshopDays, productiveHoursPerDay: null, label: `${workshopDays} workshop day(s) before load-out` },
    LOADOUT: { days: 1, productiveHoursPerDay: null, label: "Load-out day" },
    SITE: { days: round(siteDays, 2), productiveHoursPerDay: siteHoursPerDay, label: `${round(siteDays, 2)} setup day(s) × ${siteHoursPerDay} h venue access` },
    DISMANTLE: { days: 1, productiveHoursPerDay: siteHoursPerDay, label: "Dismantle day" },
  };
  traces.push(trace({ engine: "planning.windows", title: "Phase working windows", formula: "Working days from calendars (workshop days, venue access hours)", inputs: { asOf: snap.asOf, setupStart: p.setupStart, eventStart: p.eventStart, routeHours, accessOpen, accessClose, workshopWorkdays: st.workshopWorkdays }, outputs: windows as unknown as Record<string, unknown>, assumptions: [`Setup buffer before event start: ${st.setupBufferHours} h`, routeHours == null ? "Travel time unknown — workshop window assumes departure on setup day" : `Travel ${routeHours} h`], units: "days", state: routeHours == null ? "NEEDS_INFORMATION" : "CALCULATED" }));
  if (setupMs <= 0) issues.push({ severity: "error", code: "NO_SETUP_TIME", department: "PMO", message: "No setup time remains before the event start (after buffer)" });

  // ── 5. labour ──
  const brandingArea = snap.branding.reduce((s, b) => s + (b.widthM != null && b.heightM != null && b.quantity != null ? b.widthM * b.heightM * b.quantity : 0), 0);
  const workloads = [...production.workloads];
  if (loadingVolume > 0) {
    workloads.push({ key: "LOADOUT:LOAD", operation: "LOADING", quantity: loadingVolume, unit: "m3", basis: "Total packed cargo volume" });
    workloads.push({ key: "SITE:UNLOAD", operation: "UNLOADING", quantity: loadingVolume, unit: "m3", basis: "Total packed cargo volume" });
    workloads.push({ key: "DISMANTLE:ALL", operation: "DISMANTLE", quantity: loadingVolume, unit: "m3", basis: "Total packed cargo volume (strike & reload)" });
  }
  if (brandingArea > 0) workloads.push({ key: "SITE:BRANDING", operation: "BRANDING_INSTALL", quantity: round(brandingArea, 3), unit: "m2", basis: "Total branding print area" });
  const direct: DirectHours[] = av.lines.filter((l) => l.techHours != null && l.techHours > 0).map((l) => ({ key: `AV:${l.equipmentCode}:${l.requirementId.slice(-4)}`, laborKey: "AV_TECH", phase: "SITE" as const, hours: l.techHours!, basis: `Setup ${l.required} × equipment setup minutes ÷ 60` }));
  const ld = computeLaborDemands(workloads, direct, snap.laborCategories, st);
  const ldOffset = traces.length;
  traces.push(...ld.traces);
  issues.push(...ld.issues);
  const crews = computeCrews(ld.demands, snap.laborCategories, windows);
  traces.push(...crews.traces);
  issues.push(...crews.issues);
  void ldOffset;

  // ── 6. WBS ──
  const tasks: (Omit<PlannedTask, "start" | "finish" | "floatHours" | "critical" | "resourceDelayHours" | "wbsCode"> & { cal: Calendar; release?: number; fixedStart?: number; deadlineLabel?: string })[] = [];
  const deps: SchedDep[] = [];
  const headcount = new Map(snap.laborCategories.map((c) => [c.key, c.headcount]));
  const crewFor = (laborKey: string, phase: LaborPhase) => {
    const plan = crews.plans.find((x) => x.laborKey === laborKey && x.phase === phase);
    const cap = headcount.get(laborKey) ?? 0;
    return Math.max(1, Math.min(plan?.requiredCrew ?? 1, cap || 1, st.maxCrewPerTask));
  };
  const demand = (key: string) => ld.demands.find((d) => d.key === key);
  const setupDeadline = p.eventStart.getTime() - st.setupBufferHours * HOUR_MS;
  const addLaborTask = (key: string, name: string, phase: PlannedTask["phase"], dept: string, laborPhase: LaborPhase, demandKeys: string[], cal: Calendar, extra: Partial<(typeof tasks)[number]> = {}) => {
    const ds = demandKeys.map(demand).filter(Boolean) as LaborDemand[];
    if (!ds.length) return false;
    const laborKey = ds[0].laborKey;
    const unknown = ds.some((d) => d.hours == null);
    const hours = ds.reduce((s, d) => s + (d.hours ?? 0), 0);
    const crew = crewFor(laborKey, laborPhase);
    tasks.push({ key, name, phase, department: dept, laborKey, crewSize: crew, laborHours: unknown ? null : round(hours, 2), durationHours: unknown ? 0 : round(hours / crew, 2), durationState: unknown ? "NEEDS_INFORMATION" : ds.some((d) => d.state === "ESTIMATED") ? "ESTIMATED" : "CALCULATED", location: cal === workshopCal ? "Workshop" : snap.venue?.name ?? p.location, isMilestone: false, sourceType: null, sourceId: null, deadline: null, cal, ...extra });
    return true;
  };

  // procurement tasks (purchase materials that are not in stock)
  const purchaseNeeded = production.boq.map((b) => {
    const m = snap.materials.find((x) => x.id === b.materialId)!;
    const inStock = m.stockQty;
    const toBuy = inStock == null ? b.purchaseQuantity : Math.max(0, round(b.purchaseQuantity - inStock, 3));
    return { b, m, inStock, toBuy };
  });
  for (const { b, m, toBuy } of purchaseNeeded) {
    if (toBuy <= 0) continue;
    if (m.supplierLeadTimeDays == null) {
      issues.push({ severity: "warning", code: "LEAD_TIME_MISSING", department: "PROCUREMENT", subjectType: "Material", subjectId: m.id, message: `${m.code}: supplier lead time unknown — procurement date cannot be planned`, question: `What is the supplier lead time (days) for ${m.name}?` });
      continue;
    }
    tasks.push({ key: `PROC:${m.code}`, name: `Procure ${m.name} (${toBuy} ${m.unit})`, phase: "PROCUREMENT", department: "PROCUREMENT", laborKey: null, crewSize: null, laborHours: null, durationHours: m.supplierLeadTimeDays * 24, durationState: "ESTIMATED", location: m.supplierName ?? "Supplier", isMilestone: false, sourceType: "MATERIAL", sourceId: m.id, deadline: null, cal: continuous, release: asOf });
    void b;
  }

  const installKeys: string[] = [];
  const structuralInstallKeys: string[] = [];
  const workshopFinals: string[] = [];
  for (const it of [...snap.productionItems].sort((a, b) => a.code.localeCompare(b.code))) {
    const fabKey = `FAB:${it.code}`;
    const hasFab = addLaborTask(fabKey, `Fabricate ${it.code} ${it.name}`, "PRODUCTION", "PRODUCTION", "WORKSHOP", [`${it.code}:FAB`, `${it.code}:FRAME`], workshopCal, { sourceType: "PRODUCTION_ITEM", sourceId: it.id, release: asOf });
    if (hasFab) {
      const matIds = new Set([it.boardMaterialId, ...it.specs.map((s) => s.materialId)].filter(Boolean) as string[]);
      for (const mid of matIds) {
        const code = snap.materials.find((m) => m.id === mid)?.code;
        if (code && tasks.some((t) => t.key === `PROC:${code}`)) deps.push({ from: `PROC:${code}`, to: fabKey, type: "FS", lagHours: 0 });
      }
    }
    const paintKey = `PAINT:${it.code}`;
    const hasPaint = addLaborTask(paintKey, `Paint & finish ${it.code} ${it.name}`, "PRODUCTION", "PRODUCTION", "WORKSHOP", [`${it.code}:PAINT`], workshopCal, { sourceType: "PRODUCTION_ITEM", sourceId: it.id, release: asOf });
    if (hasPaint && hasFab) deps.push({ from: fabKey, to: paintKey, type: "FS", lagHours: 0 });
    if (hasPaint) {
      const paintMats = new Set(it.specs.filter((s) => s.kind === "PAINT_SURFACE").map((s) => s.materialId).filter(Boolean) as string[]);
      for (const mid of paintMats) {
        const code = snap.materials.find((m) => m.id === mid)?.code;
        if (code && tasks.some((t) => t.key === `PROC:${code}`)) deps.push({ from: `PROC:${code}`, to: paintKey, type: "FS", lagHours: 0 });
      }
    }
    if (hasPaint) workshopFinals.push(paintKey); else if (hasFab) workshopFinals.push(fabKey);

    const instKey = `INST:${it.code}`;
    const release = it.installationDay ? Math.max(p.setupStart.getTime(), localDayStart(p.setupStart.getTime(), tz) + (it.installationDay - 1) * DAY) : p.setupStart.getTime();
    if (addLaborTask(instKey, `Install ${it.code} ${it.name}`, "SETUP", "PRODUCTION", "SITE", [`${it.code}:INSTALL`], siteCal, { sourceType: "PRODUCTION_ITEM", sourceId: it.id, release, deadline: setupDeadline, deadlineLabel: "setup deadline" })) {
      installKeys.push(instKey);
      if (["STAGE", "BACKDROP", "BOOTH", "PODIUM", "DECORATIVE", "CARPENTRY", "FLOORING"].includes(it.category)) structuralInstallKeys.push(instKey);
    }
  }

  // branding prints
  const printKeys: string[] = [];
  for (const b of snap.branding) {
    if (b.leadTimeDays == null) {
      issues.push({ severity: "warning", code: "PRINT_LEADTIME_MISSING", department: "CREATIVE", subjectId: b.id, message: `${b.name}: print lead time unknown` });
      continue;
    }
    if (b.widthM == null || b.heightM == null || b.quantity == null) issues.push({ severity: "error", code: "PRINT_SPEC_MISSING", department: "CREATIVE", subjectId: b.id, message: `${b.name}: artwork dimensions or quantity missing`, question: `What are the final print dimensions and quantity for "${b.name}"?` });
    const approval = b.approvalStatus === "APPROVED" ? asOf : Math.max(asOf, b.clientApprovalDeadline?.getTime() ?? asOf);
    const key = `PRINT:${b.id.slice(-6)}`;
    tasks.push({ key, name: `Print ${b.name}`, phase: "PRODUCTION", department: "CREATIVE", laborKey: null, crewSize: null, laborHours: null, durationHours: b.leadTimeDays * 24, durationState: "ESTIMATED", location: b.vendorName ?? "Print vendor", isMilestone: false, sourceType: "BRANDING", sourceId: b.id, deadline: b.deliveryDeadline?.getTime() ?? null, deadlineLabel: "print delivery deadline", cal: continuous, release: approval });
    printKeys.push(key);
    if (b.approvalStatus !== "APPROVED") issues.push({ severity: "warning", code: "CLIENT_APPROVAL_PENDING", department: "CREATIVE", subjectId: b.id, message: `${b.name}: awaiting client artwork approval${b.clientApprovalDeadline ? ` (deadline ${b.clientApprovalDeadline.toISOString().slice(0, 10)})` : ""}` });
  }

  // load-out, transport, unload
  const hasCargo = loadingVolume > 0;
  if (hasCargo) {
    // just-in-time: load out on the departure day, depart so trucks arrive at setup start
    addLaborTask("LOAD:OUT", "Load-out at warehouse", "TRANSPORT", "LOGISTICS", "LOADOUT", ["LOADOUT:LOAD"], workshopCal, { release: Math.max(asOf, localDayStart(latestDeparture, tz)) });
    [...workshopFinals, ...printKeys].forEach((k) => deps.push({ from: k, to: "LOAD:OUT", type: "FS", lagHours: 0 }));
    tasks.push({ key: "TRAVEL:OUT", name: `Transport ${p.originCity} → ${destination} (${logistics.trips.length} vehicle(s))`, phase: "TRANSPORT", department: "LOGISTICS", laborKey: null, crewSize: null, laborHours: null, durationHours: routeHours ?? 0, durationState: logistics.routeState, location: "On route", isMilestone: false, sourceType: "ROUTE", sourceId: null, deadline: p.setupStart.getTime() + 12 * HOUR_MS, deadlineLabel: "planned arrival on first setup day", cal: continuous, release: Math.max(asOf, latestDeparture) });
    deps.push({ from: "LOAD:OUT", to: "TRAVEL:OUT", type: "FS", lagHours: 0 });
    addLaborTask("UNLOAD", "Site handover & unloading", "SETUP", "LOGISTICS", "SITE", ["SITE:UNLOAD"], siteCal, { release: p.setupStart.getTime() });
    deps.push({ from: "TRAVEL:OUT", to: "UNLOAD", type: "FS", lagHours: 0 });
    installKeys.forEach((k) => deps.push({ from: "UNLOAD", to: k, type: "FS", lagHours: 0 }));
  }

  // AV installs
  const avKeys: string[] = [];
  const order = ["TRUSS", "RIGGING", "POWER_DISTRIBUTION"];
  for (const l of av.lines) {
    if (!l.equipmentCode) continue;
    const key = `AVI:${l.equipmentCode}:${l.requirementId.slice(-4)}`;
    if (!addLaborTask(key, `Install ${l.description}`, "SETUP", "AV", "SITE", [`AV:${l.equipmentCode}:${l.requirementId.slice(-4)}`], siteCal, { sourceType: "EQUIPMENT_REQUIREMENT", sourceId: l.requirementId, release: p.setupStart.getTime(), deadline: setupDeadline, deadlineLabel: "setup deadline" })) continue;
    avKeys.push(key);
    if (hasCargo) deps.push({ from: "UNLOAD", to: key, type: "FS", lagHours: 0 });
    if (["LED_SCREEN", "LED_PROCESSOR", "PROJECTION_SCREEN", "LIGHTING_FIXTURE"].includes(l.category)) structuralInstallKeys.forEach((s) => deps.push({ from: s, to: key, type: "FS", lagHours: 0 }));
    if (!order.includes(l.category)) av.lines.filter((x) => order.includes(x.category) && x.equipmentCode).forEach((x) => deps.push({ from: `AVI:${x.equipmentCode}:${x.requirementId.slice(-4)}`, to: key, type: "FS", lagHours: 0 }));
  }

  // branding install
  if (addLaborTask("BRAND:INSTALL", "Install branding & graphics", "SETUP", "CREATIVE", "SITE", ["SITE:BRANDING"], siteCal, { release: p.setupStart.getTime(), deadline: setupDeadline, deadlineLabel: "setup deadline" })) {
    structuralInstallKeys.forEach((s) => deps.push({ from: s, to: "BRAND:INSTALL", type: "FS", lagHours: 0 }));
    if (hasCargo) deps.push({ from: "UNLOAD", to: "BRAND:INSTALL", type: "FS", lagHours: 0 });
  }

  // testing, rehearsal, inspection, event
  const fixed = (key: string, name: string, phase: PlannedTask["phase"], dept: string, hours: number, cal: Calendar, extra: Partial<(typeof tasks)[number]> = {}) =>
    tasks.push({ key, name, phase, department: dept, laborKey: null, crewSize: null, laborHours: null, durationHours: hours, durationState: "ESTIMATED", location: snap.venue?.name ?? p.location, isMilestone: hours === 0, sourceType: null, sourceId: null, deadline: null, cal, ...extra });
  if (avKeys.length) {
    fixed("AV:TEST", "Technical testing (AV)", "SETUP", "AV", st.avTestHours, siteCal, { deadline: setupDeadline, deadlineLabel: "setup deadline" });
    avKeys.forEach((k) => deps.push({ from: k, to: "AV:TEST", type: "FS", lagHours: 0 }));
  }
  fixed("REHEARSAL", "Rehearsal", "SETUP", "PMO", st.rehearsalHours, siteCal, { deadline: setupDeadline, deadlineLabel: "setup deadline" });
  if (avKeys.length) deps.push({ from: "AV:TEST", to: "REHEARSAL", type: "FS", lagHours: 0 });
  if (tasks.some((t) => t.key === "BRAND:INSTALL")) deps.push({ from: "BRAND:INSTALL", to: "REHEARSAL", type: "FS", lagHours: 0 });
  installKeys.forEach((k) => deps.push({ from: k, to: "REHEARSAL", type: "FS", lagHours: 0 }));
  fixed("INSPECT", "Final site inspection & sign-off", "SETUP", "PMO", st.finalInspectionHours, siteCal, { deadline: setupDeadline, deadlineLabel: "setup deadline" });
  deps.push({ from: "REHEARSAL", to: "INSPECT", type: "FS", lagHours: 0 });
  fixed("EVENT:START", "EVENT START", "EVENT", "PMO", 0, continuous, { fixedStart: p.eventStart.getTime(), isMilestone: true });
  deps.push({ from: "INSPECT", to: "EVENT:START", type: "FS", lagHours: 0 });
  fixed("EVENT:END", "EVENT END", "EVENT", "PMO", 0, continuous, { fixedStart: p.eventEnd.getTime(), isMilestone: true });
  deps.push({ from: "EVENT:START", to: "EVENT:END", type: "FS", lagHours: 0 });

  // dismantle & return
  if (hasCargo) {
    const dismantleCal = Calendar.daily("Dismantle access", p.eventEnd, horizonEnd, 0, 24, tz);
    if (addLaborTask("DISMANTLE", "Dismantle, strike & reload", "DISMANTLE", "PRODUCTION", "DISMANTLE", ["DISMANTLE:ALL"], dismantleCal, { release: p.eventEnd.getTime(), deadline: p.dismantleEnd?.getTime() ?? null, deadlineLabel: "venue hand-back" })) {
      deps.push({ from: "EVENT:END", to: "DISMANTLE", type: "FS", lagHours: 0 });
      tasks.push({ key: "TRAVEL:RETURN", name: `Return transport ${destination} → ${p.originCity}`, phase: "DISMANTLE", department: "LOGISTICS", laborKey: null, crewSize: null, laborHours: null, durationHours: routeHours ?? 0, durationState: logistics.routeState, location: "On route", isMilestone: false, sourceType: "ROUTE", sourceId: null, deadline: null, cal: continuous });
      deps.push({ from: "DISMANTLE", to: "TRAVEL:RETURN", type: "FS", lagHours: 0 });
    }
  }

  tasks.filter((t) => t.durationState === "NEEDS_INFORMATION" && !t.isMilestone).forEach((t) => issues.push({ severity: "warning", code: "TASK_DURATION_UNKNOWN", department: t.department, message: `"${t.name}" duration unknown (missing productivity or route data) — scheduled with zero duration, schedule is not verified` }));

  // ── 7. schedule ──
  const capacities = Object.fromEntries(snap.laborCategories.map((c) => [c.key, c.headcount]));
  const schedTasks: SchedTask[] = tasks.map((t) => ({ id: t.key, name: t.name, durationHours: t.durationHours, calendar: t.cal, release: t.release, deadline: t.deadline ?? undefined, deadlineLabel: t.deadlineLabel, fixedStart: t.fixedStart, resource: t.laborKey && t.crewSize ? { key: t.laborKey, units: t.crewSize } : undefined, isMilestone: t.isMilestone }));
  const sched = schedule(schedTasks, deps, capacities, asOf);
  const sById = new Map(sched.tasks.map((s) => [s.id, s]));
  const phaseRank: Record<PlannedTask["phase"], number> = { ADMIN: 0, PROCUREMENT: 1, PRODUCTION: 2, TRANSPORT: 3, SETUP: 4, EVENT: 5, DISMANTLE: 6 };
  const ordered = [...tasks].sort((a, b) => phaseRank[a.phase] - phaseRank[b.phase] || (sById.get(a.key)!.start ?? Infinity) - (sById.get(b.key)!.start ?? Infinity) || a.key.localeCompare(b.key));
  const phaseCounters: Record<string, number> = {};
  const plannedTasks: PlannedTask[] = ordered.map((t) => {
    const s = sById.get(t.key)!;
    const pr = phaseRank[t.phase] + 1;
    phaseCounters[t.phase] = (phaseCounters[t.phase] ?? 0) + 1;
    return { key: t.key, wbsCode: `${pr}.${String(phaseCounters[t.phase]).padStart(2, "0")}`, name: t.name, phase: t.phase, department: t.department, laborKey: t.laborKey, crewSize: t.crewSize, laborHours: t.laborHours, durationHours: t.durationHours, durationState: t.durationState, location: t.location, isMilestone: t.isMilestone, sourceType: t.sourceType, sourceId: t.sourceId, deadline: t.deadline, start: s.start, finish: s.finish, floatHours: s.floatHours, critical: s.critical, resourceDelayHours: s.resourceDelayHours };
  });
  sched.conflicts.filter((c) => c.severity === "error").forEach((c: Conflict) => issues.push({ severity: "error", code: `SCHEDULE_${c.type}`, department: tasks.find((t) => t.key === c.taskId)?.department ?? "PMO", message: c.message }));
  traces.push(trace({ engine: "planning.schedule", title: "Master schedule", formula: "Calendar-aware CPM (FS/SS/FF/SF + lag) + resource-constrained serial SGS (least late start first)", inputs: { tasks: tasks.length, dependencies: deps.length, capacities }, outputs: { makespanHours: sched.makespanHours, conflicts: sched.conflicts.length, critical: sched.criticalPath.length, feasible: sched.feasible }, assumptions: [`Workshop ${st.workshopDayStart}:00–${st.workshopDayEnd}:00 on weekdays ${st.workshopWorkdays.join(",")}`, `Venue access ${accessOpen}:00–${accessClose}:00`, "Travel and supplier lead times run continuously"], units: "hours", state: sched.feasible ? (tasks.some((t) => t.durationState === "NEEDS_INFORMATION") ? "ESTIMATED" : "CALCULATED") : "NEEDS_INFORMATION" }));

  // ── 8. procurement lines ──
  const procurement: ProcurementLine[] = [];
  const firstUse = (materialId: string) => {
    const users = plannedTasks.filter((t) => (t.key.startsWith("FAB:") || t.key.startsWith("PAINT:")) && snap.productionItems.find((i) => i.id === t.sourceId && (i.boardMaterialId === materialId || i.specs.some((s) => s.materialId === materialId))));
    const starts = users.map((u) => u.start).filter((x): x is number => x != null);
    return starts.length ? Math.min(...starts) : null;
  };
  for (const { b, m, inStock, toBuy } of purchaseNeeded) {
    if (toBuy <= 0) continue;
    const requiredBy = firstUse(m.id);
    const orderBy = requiredBy != null && m.supplierLeadTimeDays != null ? requiredBy - m.supplierLeadTimeDays * DAY : null;
    const slack = orderBy != null ? round((orderBy - asOf) / DAY, 1) : null;
    if (slack != null && slack < 0) issues.push({ severity: "error", code: "PROCUREMENT_LATE", department: "PROCUREMENT", subjectId: m.id, message: `${m.code}: order-by date already passed by ${Math.abs(slack)} day(s)` });
    procurement.push({ key: `MAT:${m.code}`, item: m.name, materialId: m.id, quantity: toBuy, unit: m.unit, inStock, requiredBy, leadTimeDays: m.supplierLeadTimeDays, orderBy, slackDays: slack, vendor: m.supplierName, unitPrice: m.unitCost, currency: m.currency, amount: m.unitCost == null ? null : round(m.unitCost * toBuy, 2), type: "PURCHASE", state: b.state });
  }
  const avArrival = sById.get("UNLOAD")?.start ?? p.setupStart.getTime();
  for (const l of av.lines.filter((x) => x.rental > 0)) {
    procurement.push({ key: `RENT:${l.equipmentCode}:${l.requirementId.slice(-4)}`, item: `Rental: ${l.model}`, materialId: null, quantity: l.rental, unit: "unit", inStock: l.ownedAvailable, requiredBy: avArrival, leadTimeDays: null, orderBy: null, slackDays: null, vendor: null, unitPrice: null, currency: l.currency, amount: l.rentalCost, type: "RENTAL", state: l.rentalCost == null ? "NEEDS_INFORMATION" : "ESTIMATED" });
  }
  for (const b of snap.branding) {
    const t = plannedTasks.find((x) => x.sourceId === b.id);
    procurement.push({ key: `PRINT:${b.id.slice(-6)}`, item: `Print: ${b.name}`, materialId: null, quantity: b.quantity ?? 0, unit: "piece", inStock: null, requiredBy: b.deliveryDeadline?.getTime() ?? null, leadTimeDays: b.leadTimeDays, orderBy: t?.start ?? null, slackDays: t?.start != null ? round((t.start - asOf) / DAY, 1) : null, vendor: b.vendorName, unitPrice: b.unitCost, currency: b.currency, amount: b.unitCost != null && b.quantity != null ? round(b.unitCost * b.quantity, 2) : null, type: "PRINT", state: b.quantity == null ? "NEEDS_INFORMATION" : "ESTIMATED" });
  }

  // ── 9. accommodation ──
  const accommodation = planAccommodation(snap.accommodation, snap.hotels, { start: p.eventStart, end: p.eventEnd });
  traces.push(...accommodation.traces);
  issues.push(...accommodation.issues);

  // ── 10. budget ──
  const lines: CostLine[] = [];
  const unpriced: string[] = [];
  for (const pl of procurement.filter((x) => x.type === "PURCHASE")) {
    if (pl.amount == null) { unpriced.push(pl.item); continue; }
    lines.push({ category: "MATERIALS", description: pl.item, quantity: pl.quantity, unit: pl.unit, unitCost: pl.unitPrice!, amount: pl.amount, currency: pl.currency, basis: "ESTIMATE", source: "Material library price × purchase quantity" });
  }
  for (const t of crews.plans) {
    if (t.estimatedCost == null) { unpriced.push(`${t.name} labour (${t.phase.toLowerCase()})`); continue; }
    lines.push({ category: "LABOR", description: `${t.name} — ${t.phase.toLowerCase()} (${t.requiredCrew} crew)`, quantity: t.requiredCrew, unit: "crew", unitCost: round(t.estimatedCost / t.requiredCrew, 2), amount: t.estimatedCost, currency: t.currency, basis: "ESTIMATE", source: "Required crew × days × daily rate" });
  }
  for (const l of av.lines.filter((x) => x.rental > 0)) {
    if (l.rentalCost == null) { unpriced.push(`Rental ${l.model}`); continue; }
    lines.push({ category: "AV_EQUIPMENT", description: `Rental ${l.model} × ${l.rental} (${av.rentalDays} days)`, quantity: l.rental, unit: "unit", unitCost: round(l.rentalCost / l.rental, 2), amount: l.rentalCost, currency: l.currency, basis: "ESTIMATE", source: "Equipment library rental rate" });
  }
  const tripDays = Math.max(1, ceilSafe((avWindowEnd.getTime() - p.setupStart.getTime()) / DAY + (routeHours ? (2 * routeHours) / 24 : 0)));
  for (const t of logistics.trips) {
    if (t.dailyCost == null) { unpriced.push(`Vehicle ${t.vehicleCode}`); continue; }
    lines.push({ category: "TRANSPORTATION", description: `${t.vehicleCode} (${t.vehicleType.toLowerCase().replace("_", " ")}) × ${tripDays} days`, quantity: tripDays, unit: "day", unitCost: t.dailyCost, amount: round(t.dailyCost * tripDays, 2), currency: t.currency, basis: "ESTIMATE", source: "Vehicle daily cost × (event window + return travel)" });
  }
  for (const r of accommodation.rooms) {
    if (r.cost == null) { unpriced.push(`Room ${r.guests.join(", ")}`); continue; }
    lines.push({ category: "ACCOMMODATION", description: `${r.hotelName} — ${r.roomType} (${r.guests.join(", ")})`, quantity: r.nights ?? 0, unit: "night", unitCost: r.nightlyRate!, amount: r.cost, currency: r.currency, basis: r.status === "CONFIRMED" ? "APPROVED_QUOTE" : "PENDING_QUOTE", source: "Hotel room rate × nights" });
  }
  for (const pl of procurement.filter((x) => x.type === "PRINT")) {
    if (pl.amount == null) { unpriced.push(pl.item); continue; }
    lines.push({ category: "PRINTING", description: pl.item, quantity: pl.quantity, unit: pl.unit, unitCost: pl.unitPrice!, amount: pl.amount, currency: pl.currency, basis: "ESTIMATE", source: "Print vendor unit price" });
  }
  for (const c of snap.manualCosts) lines.push({ category: c.category, description: c.description, quantity: c.quantity, unit: c.unit, unitCost: c.unitCost, amount: round(c.quantity * c.unitCost, 2), currency: c.currency, basis: c.basis, source: "Entered cost / quotation" });
  const budget = computeBudget(lines, { budgetAmount: p.budgetAmount, budgetCurrency: p.currency, contingencyPct: st.contingencyPct, unpriced, rates: snap.exchangeRates });
  traces.push(...budget.traces);
  issues.push(...budget.issues);

  // ── 11. risks ──
  const inspect = sById.get("INSPECT");
  const risks = generateRisks({
    origin: p.originCity, destination, routeHours,
    trips: logistics.trips.map((t) => ({ vehicleCode: t.vehicleCode, vehicleType: t.vehicleType, dailyCost: t.dailyCost, currency: t.currency })),
    backupVehicle: logistics.backupVehicle,
    avRentals: av.lines.map((l) => ({ description: l.description, rental: l.rental })),
    avBackups: av.lines.reduce((s, l) => s + l.backup, 0),
    avCategories: av.lines.map((l) => l.category),
    avPowerKw: av.totalPowerKw, venuePowerKw: snap.venue?.powerCapacityKw ?? null,
    venueAccess: snap.venue?.accessOpens ? `${snap.venue.accessOpens}–${snap.venue.accessCloses}` : null,
    materialsShort: procurement.filter((x) => x.type === "PURCHASE").map((x) => ({ code: x.key.replace("MAT:", ""), leadTimeDays: x.leadTimeDays, slackDays: x.slackDays })),
    crewShortfalls: crews.plans.filter((c) => c.shortfall > 0).map((c) => ({ name: c.name, shortfall: c.shortfall })),
    scheduleDeadlineConflicts: sched.conflicts.filter((c) => c.type === "DEADLINE").length,
    setupSlackHours: inspect?.finish != null ? round((p.eventStart.getTime() - inspect.finish) / HOUR_MS, 2) : null,
    unconfirmedRooms: accommodation.rooms.filter((r) => r.status !== "CONFIRMED").length,
    pendingClientApprovals: snap.branding.filter((b) => b.approvalStatus !== "APPROVED").length,
  }, st);

  // ── 12. readiness ──
  const dedup = new Map<string, Issue>();
  for (const i of issues) dedup.set(`${i.code}|${i.subjectId ?? ""}|${i.message}`, i);
  const finalIssues = [...dedup.values()].sort((a, b) => sev(a) - sev(b) || (a.department ?? "").localeCompare(b.department ?? "") || a.message.localeCompare(b.message));
  const byDepartment: PlanResult["readiness"]["byDepartment"] = {};
  for (const i of finalIssues) {
    const d = i.department ?? "PMO";
    byDepartment[d] ??= { errors: 0, warnings: 0 };
    if (i.severity === "error") byDepartment[d].errors++;
    if (i.severity === "warning") byDepartment[d].warnings++;
  }
  const errors = finalIssues.filter((i) => i.severity === "error").length;
  const warnings = finalIssues.filter((i) => i.severity === "warning").length;
  void prodOffset;

  return {
    generatedAt: snap.asOf.toISOString(),
    inputHash: traces.length ? traces.map((t) => t.inputHash).join("").slice(0, 32) : "",
    production, av, cargo, logistics, windows,
    laborDemands: ld.demands, trades: crews.plans,
    tasks: plannedTasks,
    dependencies: deps,
    schedule: { order: sched.order, criticalPath: sched.criticalPath, projectStart: sched.projectStart, projectFinish: sched.projectFinish, makespanHours: sched.makespanHours, conflicts: sched.conflicts, feasible: sched.feasible, method: sched.method },
    procurement, accommodation, budget, risks,
    issues: finalIssues,
    traces,
    readiness: {
      errors, warnings,
      questions: finalIssues.filter((i) => i.question).map((i) => ({ department: i.department ?? "PMO", question: i.question!, code: i.code })),
      byDepartment,
      feasible: sched.feasible && errors === 0,
      overallState: errors > 0 ? "NEEDS_INFORMATION" : warnings > 0 ? "ESTIMATED" : "CALCULATED",
    },
  };
}

const sev = (i: Issue) => (i.severity === "error" ? 0 : i.severity === "warning" ? 1 : 2);
