import { describe, expect, it } from "vitest";
import { runPlanningPipeline } from "@/engines/pipeline";
import { compareImpact } from "@/engines/impact";
import { applyScenario } from "@/engines/whatif";
import { canReadFinancials, MONEY_KEYS, redactChangeEntries, redactImpact, redactPlanFinancials, redactRecords } from "@/lib/financial";
import { ROLE_PERMISSIONS, type Permission } from "@/lib/permissions";
import { aswanSnapshot } from "../fixtures/aswanSnapshot";

const hasNumber = (x: unknown): boolean => typeof x === "number" || (x != null && typeof x === "object" && Object.values(x as object).some(hasNumber));
/** Every path where a money-named key still holds a number (directly or inside it). */
function moneyLeaks(v: unknown, path = "$", out: string[] = []): string[] {
  if (v == null || typeof v !== "object") return out;
  if (Array.isArray(v)) { v.forEach((x, i) => moneyLeaks(x, `${path}[${i}]`, out)); return out; }
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (MONEY_KEYS.has(k) && hasNumber(x)) out.push(`${path}.${k}=${JSON.stringify(x).slice(0, 40)}`);
    else moneyLeaks(x, `${path}.${k}`, out);
  }
  return out;
}

describe("P1-2 financial redaction", () => {
  const plan = runPlanningPipeline(aswanSnapshot());

  it("the unredacted demo plan does contain money (the test is meaningful)", () => {
    expect(moneyLeaks(plan).length).toBeGreaterThan(10);
    expect(plan.budget.byCurrency.length).toBeGreaterThan(0);
  });

  it("removes every monetary value from a plan", () => {
    const r = redactPlanFinancials(plan);
    expect(moneyLeaks(r)).toEqual([]);
    expect(r.budget.lines).toEqual([]);
    expect(r.traces.some((t) => t.engine.startsWith("budget"))).toBe(false);
    expect(r.issues.some((i) => /^(BUDGET|COST|FX)/.test(i.code))).toBe(false);
    expect(JSON.stringify(r.traces.flatMap((t) => t.assumptions))).not.toMatch(/\b1 [A-Z]{3} = /);
  });

  it("keeps quantities, schedule and technical data intact", () => {
    const r = redactPlanFinancials(plan);
    expect(r.production.boq.map((b) => b.purchaseQuantity)).toEqual(plan.production.boq.map((b) => b.purchaseQuantity));
    expect(r.trades.map((t) => t.requiredCrew)).toEqual(plan.trades.map((t) => t.requiredCrew));
    expect(r.tasks).toEqual(plan.tasks);
    expect(r.logistics.trips.map((t) => t.weightKg)).toEqual(plan.logistics.trips.map((t) => t.weightKg));
    expect(plan.budget.byCurrency.length).toBeGreaterThan(0); // original untouched (deep copy)
  });

  it("removes the budget domain and cost deltas from impact analyses", () => {
    const base = plan;
    const next = runPlanningPipeline(applyScenario(aswanSnapshot(), { budgetChangePct: -20, materialPriceChangePct: 10 }).snapshot);
    const impact = compareImpact(base, next);
    expect(impact.domains.some((d) => d.domain === "Budget")).toBe(true);
    const r = redactImpact({ impact, baseline: { cost: [{ currency: "EGP", total: 1 }], budgetVariance: 5 }, scenario: { cost: [{ currency: "EGP", total: 2 }] }, recommendations: ["Plan exceeds the budget by 9"] });
    expect(r.impact.domains.some((d) => d.domain === "Budget")).toBe(false);
    expect(r.baseline.cost).toEqual([]);
    expect(r.recommendations).toEqual([]);
    expect(moneyLeaks(r)).toEqual([]);
  });

  it("blanks monetary change-request fields and record prices, preserving dates and decimals", () => {
    expect(redactChangeEntries([{ field: "budgetAmount", from: 1, to: 2 }, { field: "participants", from: 1, to: 2 }])).toEqual([{ field: "budgetAmount", from: null, to: null }, { field: "participants", from: 1, to: 2 }]);
    const when = new Date("2026-01-01T00:00:00Z");
    const rows = [{ code: "MDF", unitCost: 900, createdAt: when, nested: { roomTypes: [{ nightlyRate: 5, capacity: 2 }] } }];
    const viewer = { permissions: new Set<Permission>(ROLE_PERMISSIONS.VIEWER) };
    const r = redactRecords(viewer, rows);
    expect(r[0].unitCost).toBeNull();
    expect(r[0].createdAt).toBe(when);
    expect(r[0].nested.roomTypes[0]).toEqual({ nightlyRate: null, capacity: 2 });
    const finance = { permissions: new Set<Permission>(ROLE_PERMISSIONS.FINANCE) };
    expect(redactRecords(finance, rows)).toBe(rows);
  });

  it("permission matrix: only roles with budget.read can read financials", () => {
    const allowed = Object.entries(ROLE_PERMISSIONS).filter(([, p]) => canReadFinancials({ permissions: new Set(p) })).map(([r]) => r).sort();
    expect(allowed).toEqual(["ACCOUNT_MANAGER", "FINANCE", "PROCUREMENT_MANAGER", "PROJECT_MANAGER", "SUPER_ADMIN"]);
  });
});
