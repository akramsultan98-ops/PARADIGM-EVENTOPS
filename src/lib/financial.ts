import type { AuthUser } from "@/lib/auth/session";
import type { PlanResult } from "@/engines/pipeline";
import type { CalcTrace } from "@/engines/trace";

/**
 * Financial confidentiality (P1-2). Costs, prices, rates and budgets are visible only with `budget.read`.
 * Enforcement happens on the server where data is LOADED (plan loaders, workbook, assistant, report,
 * project context) — UI hiding is cosmetic. Anything not redacted here must be gated at its call site
 * with `canReadFinancials`.
 */
export function canReadFinancials(u: Pick<AuthUser, "permissions">): boolean {
  return u.permissions.has("budget.read");
}

/** Object keys that carry money (amounts, prices, rates, budgets). Matching values are nulled in redacted copies. */
export const MONEY_KEYS = new Set([
  "cost", "unitCost", "unitPrice", "amount", "rentalCost", "estimatedCost", "dailyCost", "dailyRate", "overtimeHourlyRate",
  "rentalDailyRate", "nightlyRate", "costByCurrency", "budget", "budgetAmount", "totalInBudgetCurrency", "variance",
  "costImpact", "byCurrency", "totalBudget", "converted", "rate", "rentalRate",
]);

/** Engines whose traces are financial in their entirety (removed, not just nulled). */
const FINANCIAL_ENGINES = /^(budget|cost|procurement\.price|fx)/;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 12 || value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (Object.getPrototypeOf(value) !== Object.prototype) return value; // Date, Decimal, Buffer… are values, not containers
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = MONEY_KEYS.has(k) ? null : scrub(v, depth + 1);
  return out;
}

const scrubTrace = (t: CalcTrace): CalcTrace => ({ ...t, inputs: scrub(t.inputs) as CalcTrace["inputs"], outputs: scrub(t.outputs) as CalcTrace["outputs"], assumptions: t.assumptions.filter((a) => !/\d+(\.\d+)?\s*(EGP|USD|EUR|GBP|SAR|AED)\b|\b1 [A-Z]{3} = /.test(a)) });

function scrubNestedTraces(node: unknown, depth = 0): void {
  if (depth > 8 || node == null || typeof node !== "object") return;
  if (Array.isArray(node)) { node.forEach((n) => scrubNestedTraces(n, depth + 1)); return; }
  const o = node as Record<string, unknown>;
  for (const [k, v] of Object.entries(o)) {
    if (k === "traces" && Array.isArray(v)) o[k] = (v as CalcTrace[]).filter((t) => !FINANCIAL_ENGINES.test(t.engine)).map(scrubTrace);
    else if (k === "trace" && v && typeof v === "object" && "engine" in (v as object)) o[k] = scrubTrace(v as CalcTrace);
    else scrubNestedTraces(v, depth + 1);
  }
}

/** Deep copy of a plan with every monetary value removed. Quantities, schedule and technical data are untouched. */
export function redactPlanFinancials(plan: PlanResult): PlanResult & { financialsRedacted: true } {
  const P = structuredClone(plan);
  P.production.boq = P.production.boq.map((b) => ({ ...b, unitCost: null, cost: null }));
  P.av.lines = P.av.lines.map((l) => ({ ...l, rentalCost: null }));
  P.logistics.trips = P.logistics.trips.map((t) => ({ ...t, dailyCost: null }));
  P.trades = P.trades.map((t) => ({ ...t, estimatedCost: null }));
  P.procurement = P.procurement.map((l) => ({ ...l, unitPrice: null, amount: null }));
  P.accommodation = { ...P.accommodation, costByCurrency: {}, rooms: P.accommodation.rooms.map((r) => ({ ...r, nightlyRate: null, cost: null })) };
  P.risks = P.risks.map((r) => ({ ...r, costImpact: null, costCurrency: null }));
  P.budget = { lines: [], byCurrency: [], budgetCurrency: P.budget.budgetCurrency, budgetAmount: null, totalInBudgetCurrency: null, conversions: [], unconvertible: [], variance: null, utilizationPct: null, unpricedItems: [], traces: [], issues: [] };
  P.traces = P.traces.filter((t) => !FINANCIAL_ENGINES.test(t.engine)).map(scrubTrace);
  // engine sections carry their own trace copies (av.traces, accommodation.traces, cutting[].result.trace …)
  scrubNestedTraces(P);
  P.issues = P.issues.filter((i) => !/^(BUDGET|COST|FX|PRICE)/.test(i.code));
  return Object.assign(P, { financialsRedacted: true as const });
}

export function planForUser<T extends PlanResult>(u: Pick<AuthUser, "permissions">, plan: T): T {
  return canReadFinancials(u) ? plan : (redactPlanFinancials(plan) as unknown as T);
}

/** Impact analysis (change requests / what-if) without the budget domain or monetary deltas. */
export function redactImpact<T>(impact: T): T {
  if (!impact || typeof impact !== "object") return impact;
  const i = structuredClone(impact) as Record<string, unknown>;
  if (Array.isArray(i.domains)) i.domains = (i.domains as { domain: string }[]).filter((d) => d.domain !== "Budget").map((d) => scrub(d));
  for (const k of ["before", "after", "baseline", "scenario"]) if (i[k] && typeof i[k] === "object") i[k] = { ...(i[k] as object), cost: [], budgetVariance: null };
  if (typeof i.summary === "string") i.summary = i.summary.replace(/,?\s*Budget\b/g, "");
  if (i.impact) i.impact = redactImpact(i.impact);
  if (Array.isArray(i.recommendations)) i.recommendations = (i.recommendations as string[]).filter((r) => !/budget|cost|price/i.test(r));
  return i as T;
}

/** Change-request field changes with monetary fields (e.g. budgetAmount) blanked. */
export function redactChangeEntries<T>(changes: T): T {
  if (!Array.isArray(changes)) return changes;
  return changes.map((c: { field?: string }) => (c && c.field && MONEY_KEYS.has(c.field) ? { ...c, from: null, to: null } : c)) as T;
}

/** Database rows (any nesting) with monetary fields nulled unless the user has budget.read. */
export function redactRecords<T>(u: Pick<AuthUser, "permissions">, rows: T): T {
  return canReadFinancials(u) ? rows : (scrub(rows) as T);
}
