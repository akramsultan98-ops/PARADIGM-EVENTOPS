import { fromLocalInput } from "@/lib/format";

/**
 * Typed validation for change requests (P1-3 / P2-B). Every proposed value is validated and NORMALISED
 * before a change request is stored, and validated again (against the current record) before it is applied,
 * so an approved change can never fail half-way on a database type error.
 */
export type ChangeEntity = "ProductionItem" | "Project" | "Vehicle" | "EquipmentRequirement";
export type ChangeValue = number | boolean | string;
export interface NormalisedChange { field: string; to: ChangeValue }

type Rule = (raw: unknown, label: string) => ChangeValue;

const num = (raw: unknown, label: string) => {
  if (typeof raw === "boolean" || raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) throw new Error(`${label}: a number is required`);
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, "").trim());
  if (!Number.isFinite(n)) throw new Error(`${label}: "${String(raw)}" is not a valid number`);
  return n;
};
const int = (min: number, max: number): Rule => (raw, label) => {
  const n = num(raw, label);
  if (!Number.isInteger(n)) throw new Error(`${label} must be a whole number (got ${n})`);
  if (n < min || n > max) throw new Error(`${label} must be between ${min} and ${max}`);
  return n;
};
const positive = (max: number): Rule => (raw, label) => {
  const n = num(raw, label);
  if (n <= 0) throw new Error(`${label} must be greater than zero`);
  if (n > max) throw new Error(`${label} must not exceed ${max}`);
  return Math.round(n * 1e4) / 1e4;
};
const money: Rule = (raw, label) => {
  const n = num(raw, label);
  if (n < 0) throw new Error(`${label} must not be negative`);
  if (n > 1e12) throw new Error(`${label} is too large`);
  if (Math.round(n * 100) / 100 !== n) throw new Error(`${label} must have at most 2 decimals`);
  return n;
};
const bool: Rule = (raw, label) => {
  if (raw === true || raw === "true") return true;
  if (raw === false || raw === "false") return false;
  throw new Error(`${label} must be true or false`);
};
/** Accepts an ISO timestamp with zone, or the app's local "YYYY-MM-DDTHH:mm" (Africa/Cairo). Stored as ISO UTC. */
export function parseChangeDate(raw: unknown, label = "Date"): Date {
  const s = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?(Z|[+-]\d{2}:\d{2})?$/.test(s)) throw new Error(`${label}: "${s}" is not a valid date/time`);
  const d = /Z$|[+-]\d{2}:\d{2}$/.test(s) ? new Date(s) : fromLocalInput(s.slice(0, 16));
  if (Number.isNaN(d.getTime())) throw new Error(`${label}: "${s}" is not a valid date/time`);
  if (d.getUTCFullYear() < 2000 || d.getUTCFullYear() > 2100) throw new Error(`${label}: year out of range`);
  return d;
}
const date: Rule = (raw, label) => parseChangeDate(raw, label).toISOString();

export const CHANGE_RULES: Record<ChangeEntity, Record<string, { label: string; rule: Rule }>> = {
  ProductionItem: {
    widthM: { label: "Width (m)", rule: positive(100) },
    heightM: { label: "Height (m)", rule: positive(100) },
    depthM: { label: "Depth (m)", rule: positive(100) },
    quantity: { label: "Quantity", rule: int(1, 1000) },
  },
  Project: {
    eventStart: { label: "Event start", rule: date },
    eventEnd: { label: "Event end", rule: date },
    setupStart: { label: "Setup start", rule: date },
    participants: { label: "Participants", rule: int(1, 100000) },
    budgetAmount: { label: "Budget", rule: money },
  },
  Vehicle: { available: { label: "Available", rule: bool } },
  EquipmentRequirement: {
    quantity: { label: "Quantity", rule: int(1, 10000) },
    backupQuantity: { label: "Backup quantity", rule: int(0, 1000) },
  },
};

/** Fields whose change needs budget.read to propose (monetary). */
export const FINANCIAL_CHANGE_FIELDS = new Set(["budgetAmount"]);

/** Validate + normalise. Throws a user-facing Error describing the first invalid value. */
export function normaliseChanges(entityType: string, changes: { field: string; to: unknown }[]): NormalisedChange[] {
  const rules = CHANGE_RULES[entityType as ChangeEntity];
  if (!rules) throw new Error(`Unsupported change target ${entityType}`);
  if (!Array.isArray(changes) || changes.length === 0) throw new Error("At least one change is required");
  const seen = new Set<string>();
  return changes.map((c) => {
    const r = rules[c.field];
    if (!r) throw new Error(`Field ${c.field} cannot be changed through a change request`);
    if (seen.has(c.field)) throw new Error(`Field ${c.field} appears more than once`);
    seen.add(c.field);
    return { field: c.field, to: r.rule(c.to, r.label) };
  });
}

export interface ProjectDates { setupStart: Date; setupEnd: Date; eventStart: Date; eventEnd: Date; dismantleStart?: Date | null; dismantleEnd?: Date | null }

/** setupStart < setupEnd ≤ eventStart < eventEnd ≤ dismantleStart ≤ dismantleEnd. */
export function checkProjectDates(d: ProjectDates) {
  const t = (x: Date) => x.getTime();
  if (!(t(d.eventStart) < t(d.eventEnd))) throw new Error("Event start must be before event end");
  if (!(t(d.setupStart) < t(d.setupEnd))) throw new Error("Setup start must be before setup end");
  if (t(d.setupEnd) > t(d.eventStart)) throw new Error("Setup must end before the event starts");
  if (d.dismantleStart && t(d.dismantleStart) < t(d.eventEnd)) throw new Error("Dismantle cannot start before the event ends");
  if (d.dismantleStart && d.dismantleEnd && t(d.dismantleEnd) < t(d.dismantleStart)) throw new Error("Dismantle end must be after dismantle start");
}

/** Apply normalised Project date changes to the current dates and check the resulting order. */
export function projectDatesAfter(current: ProjectDates, changes: NormalisedChange[]): ProjectDates {
  const next = { ...current };
  for (const c of changes) if (c.field === "eventStart" || c.field === "eventEnd" || c.field === "setupStart") next[c.field] = new Date(String(c.to));
  checkProjectDates(next);
  return next;
}

/** Normalised change → Prisma update data. */
export function toUpdateData(changes: NormalisedChange[]): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const c of changes) data[c.field] = ["eventStart", "eventEnd", "setupStart"].includes(c.field) ? new Date(String(c.to)) : c.to;
  return data;
}
