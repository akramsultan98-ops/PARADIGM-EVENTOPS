/**
 * What-if scenario engine (spec §22). Applies assumptions to a COPY of the snapshot; the
 * approved plan is never modified. Compare with compareImpact(baseline, scenario).
 */
import type { ProjectSnapshot } from "./snapshot";

export interface ScenarioAssumptions {
  /** number of setup days (setup starts N days before event start at the original clock time) */
  setupDays?: number;
  vehiclesUnavailable?: string[];
  /** extra delay (hours) on supplier lead times; materialCodes empty = all */
  supplierDelay?: { hours: number; materialCodes?: string[] };
  /** extra hours on route duration (traffic, convoy) */
  travelDelayHours?: number;
  participantsDelta?: number;
  budgetChangePct?: number;
  materialPriceChangePct?: number;
  laborUnavailable?: { laborKey: string; count: number }[];
  eventShiftDays?: number;
  /** production item dimension override, e.g. backdrop 8m → 10m */
  itemResize?: { itemCode: string; widthM?: number; heightM?: number }[];
}

const DAY = 86400000;

export function applyScenario(snap: ProjectSnapshot, a: ScenarioAssumptions): { snapshot: ProjectSnapshot; notes: string[] } {
  const s: ProjectSnapshot = structuredClone(snap);
  const notes: string[] = [];
  if (a.eventShiftDays) {
    const ms = a.eventShiftDays * DAY;
    const p = s.project;
    for (const k of ["eventStart", "eventEnd", "setupStart", "setupEnd"] as const) p[k] = new Date(p[k].getTime() + ms);
    if (p.dismantleStart) p.dismantleStart = new Date(p.dismantleStart.getTime() + ms);
    if (p.dismantleEnd) p.dismantleEnd = new Date(p.dismantleEnd.getTime() + ms);
    s.accommodation.forEach((x) => { if (x.checkIn) x.checkIn = new Date(x.checkIn.getTime() + ms); if (x.checkOut) x.checkOut = new Date(x.checkOut.getTime() + ms); });
    notes.push(`Event moved by ${a.eventShiftDays} day(s); accommodation dates shifted accordingly (hotel availability must be re-confirmed)`);
  }
  if (a.setupDays !== undefined) {
    const p = s.project;
    const clock = p.setupStart.getTime() % DAY;
    const eventDay = p.eventStart.getTime() - (p.eventStart.getTime() % DAY);
    p.setupStart = new Date(eventDay - a.setupDays * DAY + clock);
    notes.push(`Setup window reduced to ${a.setupDays} day(s) — setup starts ${p.setupStart.toISOString().slice(0, 16)}Z`);
  }
  if (a.vehiclesUnavailable?.length) {
    s.vehicles.forEach((v) => { if (a.vehiclesUnavailable!.includes(v.code)) { v.available = false; v.maintenanceStatus = "BREAKDOWN (scenario)"; } });
    notes.push(`Vehicles unavailable: ${a.vehiclesUnavailable.join(", ")}`);
  }
  if (a.supplierDelay) {
    const days = a.supplierDelay.hours / 24;
    s.materials.forEach((m) => { if (m.supplierLeadTimeDays != null && (!a.supplierDelay!.materialCodes?.length || a.supplierDelay!.materialCodes.includes(m.code))) m.supplierLeadTimeDays += days; });
    s.branding.forEach((b) => { if (b.leadTimeDays != null && !a.supplierDelay!.materialCodes?.length) b.leadTimeDays += days; });
    notes.push(`Supplier deliveries delayed ${a.supplierDelay.hours} h${a.supplierDelay.materialCodes?.length ? ` (${a.supplierDelay.materialCodes.join(", ")})` : ""}`);
  }
  if (a.travelDelayHours) {
    s.routes.forEach((r) => { if (r.durationHours != null) r.durationHours += a.travelDelayHours!; });
    notes.push(`Travel delayed ${a.travelDelayHours} h`);
  }
  if (a.participantsDelta) {
    s.project.participants += a.participantsDelta;
    notes.push(`Participants ${a.participantsDelta > 0 ? "+" : ""}${a.participantsDelta} → ${s.project.participants}. No participant-driven quantity rules are approved: AV (microphones, interpretation headsets), Creative (badges, signage) and Account Management must review requirements.`);
  }
  if (a.budgetChangePct) {
    if (s.project.budgetAmount != null) s.project.budgetAmount = Math.round(s.project.budgetAmount * (1 + a.budgetChangePct / 100) * 100) / 100;
    notes.push(`Budget ${a.budgetChangePct > 0 ? "+" : ""}${a.budgetChangePct}%`);
  }
  if (a.materialPriceChangePct) {
    s.materials.forEach((m) => { if (m.unitCost != null) m.unitCost = Math.round(m.unitCost * (1 + a.materialPriceChangePct! / 100) * 100) / 100; });
    notes.push(`Material prices ${a.materialPriceChangePct > 0 ? "+" : ""}${a.materialPriceChangePct}%`);
  }
  for (const l of a.laborUnavailable ?? []) {
    const c = s.laborCategories.find((x) => x.key === l.laborKey);
    if (c) { c.headcount = Math.max(0, c.headcount - l.count); notes.push(`${c.name}: ${l.count} unavailable → ${c.headcount} available`); }
  }
  for (const r of a.itemResize ?? []) {
    const it = s.productionItems.find((x) => x.code === r.itemCode);
    if (!it) continue;
    const fw = r.widthM && it.widthM ? r.widthM / it.widthM : 1;
    const fh = r.heightM && it.heightM ? r.heightM / it.heightM : 1;
    notes.push(`${it.code} resized ${it.widthM}×${it.heightM} m → ${r.widthM ?? it.widthM}×${r.heightM ?? it.heightM} m. Panel/frame specs scaled proportionally for simulation only — revised drawings required.`);
    it.widthM = r.widthM ?? it.widthM;
    it.heightM = r.heightM ?? it.heightM;
    // scale drawing-derived components proportionally: count of full-width panels grows with width
    for (const sp of it.specs) {
      if (sp.kind === "PANEL" || sp.kind === "PAINT_SURFACE") sp.quantity = Math.max(1, Math.ceil(sp.quantity * fw * fh - 1e-9));
      if (sp.kind === "FRAME_MEMBER") sp.quantity = Math.max(1, Math.ceil(sp.quantity * Math.max(fw, fh) - 1e-9));
    }
  }
  return { snapshot: s, notes };
}

/** Parse a natural-language what-if question into structured assumptions (rule-based). */
export function parseWhatIf(q: string): ScenarioAssumptions {
  const t = q.toLowerCase();
  const a: ScenarioAssumptions = {};
  const num = (re: RegExp) => { const m = re.exec(t); return m ? Number(m[1]) : undefined; };
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, single: 1 };
  const sd = /(\d+|one|two|three|single)\s+(?:setup\s+)?days?\s+(?:of\s+)?setup|(\d+|one|two|three|single)[- ]day setup|only (?:get|have) (\d+|one|two|three) (?:setup )?day/.exec(t);
  if (sd) { const v = sd[1] ?? sd[2] ?? sd[3]; a.setupDays = words[v] ?? Number(v); }
  if (/truck|vehicle|lorry/.test(t) && /break|unavailable|not available|down/.test(t)) a.vehiclesUnavailable = ["__MAIN__"];
  const delay = num(/delay(?:ed)?\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*h/) ?? num(/(\d+(?:\.\d+)?)\s*(?:hours?|h)\s+(?:late|delay)/);
  if (delay !== undefined) {
    if (/traffic|travel|road|convoy/.test(t)) a.travelDelayHours = delay;
    else a.supplierDelay = { hours: delay };
  }
  const part = num(/participants?\s+(?:increase|grow|rise)s?\s+(?:by\s+)?(\d+)/) ?? num(/(\d+)\s+more\s+participants/) ?? num(/increases?\s+by\s+(\d+)/);
  if (part !== undefined && /participant|attendee|guest/.test(t)) a.participantsDelta = part;
  const bud = num(/budget\s+(?:decreases?|reduced?|cut)\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*%/);
  if (bud !== undefined) a.budgetChangePct = -bud;
  const bud2 = num(/budget\s+(?:increases?)\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*%/);
  if (bud2 !== undefined) a.budgetChangePct = bud2;
  const shift = num(/(?:event|date)\s+(?:moves?|shifts?|postponed)\s+(?:by\s+)?(\d+)\s+days?/);
  if (shift !== undefined) a.eventShiftDays = shift;
  const price = num(/(?:material\s+)?prices?\s+(?:increase|rise)s?\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*%/);
  if (price !== undefined) a.materialPriceChangePct = price;
  return a;
}
