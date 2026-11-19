import { describe, expect, it } from "vitest";
import { runPlanningPipeline } from "@/engines/pipeline";
import { compareImpact } from "@/engines/impact";
import { applyScenario, parseWhatIf } from "@/engines/whatif";
import { aswanSnapshot } from "../fixtures/aswanSnapshot";

describe("integrated planning pipeline (Aswan demo)", () => {
  const plan = runPlanningPipeline(aswanSnapshot());

  it("is reproducible for identical inputs", () => {
    const again = runPlanningPipeline(aswanSnapshot());
    expect(JSON.stringify(again)).toBe(JSON.stringify(plan));
  });

  it("generates a WBS covering procurement → production → transport → setup → event → dismantle", () => {
    const phases = new Set(plan.tasks.map((t) => t.phase));
    for (const p of ["PROCUREMENT", "PRODUCTION", "TRANSPORT", "SETUP", "EVENT", "DISMANTLE"]) expect(phases.has(p as never)).toBe(true);
    expect(plan.tasks.find((t) => t.key === "EVENT:START")!.start).toBe(Date.parse("2026-12-15T07:00:00Z"));
    expect(plan.tasks.some((t) => t.key === "INST:BKD-01")).toBe(true);
  });

  it("schedules installation after transport arrival and inside venue access hours", () => {
    const travel = plan.tasks.find((t) => t.key === "TRAVEL:OUT")!;
    const inst = plan.tasks.find((t) => t.key === "INST:BKD-01")!;
    expect(inst.start!).toBeGreaterThanOrEqual(travel.finish!);
    const localHour = new Date(inst.start! + 2 * 3600000).getUTCHours();
    expect(localHour).toBeGreaterThanOrEqual(7);
    expect(localHour).toBeLessThan(23);
  });

  it("identifies the LED rental gap caused by another project's booking", () => {
    const led = plan.av.lines.find((l) => l.equipmentCode === "LED-P39")!;
    // owned 96 − 2 out of service − 30 booked = 64 available; 84 + 6 backup = 90 → 26 rental
    expect(led.allocated).toBe(64);
    expect(led.rental).toBe(26);
    expect(plan.procurement.some((p) => p.type === "RENTAL")).toBe(true);
  });

  it("assigns cargo to vehicles within weight and volume limits and excludes the truck in service", () => {
    expect(plan.logistics.trips.length).toBeGreaterThan(0);
    for (const t of plan.logistics.trips) {
      expect(t.weightUtilPct).toBeLessThanOrEqual(85.01);
      expect(t.volumeUtilPct).toBeLessThanOrEqual(85.01);
    }
    expect(plan.logistics.trips.some((t) => t.vehicleCode === "TRK-03")).toBe(false);
  });

  it("surfaces missing information (dismantle productivity, podium drawing, unnamed guest)", () => {
    const codes = plan.issues.map((i) => i.code);
    expect(codes).toContain("LABOR_RATE_MISSING");
    expect(codes).toContain("PROD_DRAWING_MISSING");
    expect(codes).toContain("ACC_NAME_MISSING");
    expect(codes).toContain("ROUTE_NOT_APPROVED");
    expect(plan.readiness.questions.length).toBeGreaterThan(3);
  });

  it("keeps the USD licence separate and converts it only with the stored demo rate", () => {
    expect(plan.budget.byCurrency.map((c) => c.currency)).toEqual(["EGP", "USD"]);
    expect(plan.budget.conversions[0]).toMatchObject({ from: "USD", rate: 48.5 });
  });

  it("generates hypothetical risks with plan-derived contingencies", () => {
    const truck = plan.risks.find((r) => r.ruleKey === "TRUCK_BREAKDOWN")!;
    expect(truck.timeImpactHours).toBe(13);
    expect(plan.risks.some((r) => r.ruleKey === "RENTAL_DELIVERY_DELAY")).toBe(true);
  });

  it("generates procurement order-by dates from lead times and the schedule", () => {
    const ply = plan.procurement.find((p) => p.key === "MAT:PLY-18")!;
    expect(ply.leadTimeDays).toBe(5);
    expect(ply.orderBy).toBe(ply.requiredBy! - 5 * 86400000);
  });
});

describe("change impact & what-if", () => {
  const base = runPlanningPipeline(aswanSnapshot());

  it("backdrop 8 m → 10 m increases boards, labour, cost and requests approvals", () => {
    const { snapshot } = applyScenario(aswanSnapshot(), { itemResize: [{ itemCode: "BKD-01", widthM: 10 }] });
    const next = runPlanningPipeline(snapshot);
    const impact = compareImpact(base, next);
    const mat = impact.domains.find((d) => d.domain === "Materials")!;
    expect(mat.changed).toBe(true);
    expect(mat.deltas.find((x) => x.label.startsWith("MDF-18"))!.change!).toBeGreaterThan(0);
    expect(impact.domains.find((d) => d.domain === "Labour")!.changed).toBe(true);
    expect(impact.approvalsRequired).toEqual(expect.arrayContaining(["PRODUCTION", "FINANCE", "PMO"]));
  });

  it("one setup day produces schedule conflicts instead of a falsely feasible plan", () => {
    const { snapshot } = applyScenario(aswanSnapshot(), { setupDays: 1 });
    const next = runPlanningPipeline(snapshot);
    expect(next.tasks.length).toBe(base.tasks.length); // nothing dropped
    expect(next.trades.find((t) => t.laborKey === "CARPENTER" && t.phase === "SITE")!.requiredCrew).toBeGreaterThanOrEqual(base.trades.find((t) => t.laborKey === "CARPENTER" && t.phase === "SITE")!.requiredCrew);
  });

  it("main truck breakdown reallocates cargo", () => {
    const { snapshot } = applyScenario(aswanSnapshot(), { vehiclesUnavailable: [base.logistics.trips[0].vehicleCode] });
    const next = runPlanningPipeline(snapshot);
    expect(next.logistics.trips.some((t) => t.vehicleCode === base.logistics.trips[0].vehicleCode)).toBe(false);
  });

  it("does not mutate the baseline snapshot", () => {
    const s = aswanSnapshot();
    applyScenario(s, { setupDays: 1, budgetChangePct: -15 });
    expect(s.project.budgetAmount).toBe(1500000);
  });

  it("parses natural-language what-if questions", () => {
    expect(parseWhatIf("What if we only get one setup day?").setupDays).toBe(1);
    expect(parseWhatIf("What if the main truck breaks down?").vehiclesUnavailable).toBeDefined();
    expect(parseWhatIf("What if the LED delivery is delayed 6 hours?").supplierDelay?.hours).toBe(6);
    expect(parseWhatIf("What if the participant count increases by 50?").participantsDelta).toBe(50);
    expect(parseWhatIf("What if the budget decreases by 15%?").budgetChangePct).toBe(-15);
  });
});
