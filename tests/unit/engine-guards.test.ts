import { describe, expect, it } from "vitest";
import { planTransport, MAX_CARGO_UNITS } from "@/engines/logistics";
import { optimizeCutting, MAX_CUTTING_PIECES } from "@/engines/production/cutting";
import { optimizeTimber } from "@/engines/production/timber";
import { computeCrews, peakCommittedElsewhere } from "@/engines/manpower";
import { runPlanningPipeline } from "@/engines/pipeline";
import { DEFAULT_STANDARDS, type LaborCategorySnap, type VehicleSnap } from "@/engines/snapshot";
import { inspectZip, withTimeout } from "@/server/services/file-safety";
import { optInt, optNonNegative, optPositive } from "@/lib/validation";
import { aswanSnapshot } from "../fixtures/aswanSnapshot";
import { zipWith } from "../support/zip";

const veh = (code: string, payloadKg: number, volumeM3: number, lengthM: number): VehicleSnap => ({ id: code, code, type: "TRUCK", payloadKg, volumeM3, internalLengthM: lengthM, internalWidthM: 2, internalHeightM: 2, dailyCost: 1000, currency: "EGP", available: true, maintenanceStatus: "OK", bookedElsewhere: [] });
const opts = { fillFactor: 1, window: { start: new Date("2026-01-01"), end: new Date("2026-01-03") }, origin: "Cairo", destination: "Aswan", routes: [{ origin: "Cairo", destination: "Aswan", distanceKm: 880, durationHours: 13, approved: true, source: "x" }], driversAvailable: 5 };

describe("P2-F fleet: backup vehicle must fit the load it replaces (Codex)", () => {
  it("does not offer a backup whose interior is shorter than the longest piece", () => {
    const cargo = [{ key: "truss", sourceType: "X", name: "truss 5.5 m", quantity: 1, unitWeightKg: 300, unitVolumeM3: 2, maxDimM: 5.5, fragile: false }];
    // MAIN carries the truss; SHORT has enough payload/volume but only a 4 m bed; LONG fits.
    const r1 = planTransport(cargo, [veh("MAIN", 3000, 20, 6), veh("SHORT", 5000, 30, 4)], opts);
    expect(r1.trips[0].vehicleCode).toBe("MAIN");
    expect(r1.backupVehicle).toBeNull();
    expect(r1.issues.some((i) => i.code === "NO_BACKUP_VEHICLE")).toBe(true);
    const r2 = planTransport(cargo, [veh("MAIN", 3000, 20, 6), veh("SHORT", 5000, 30, 4), veh("LONG", 3000, 25, 7)], opts);
    expect(r2.backupVehicle?.code).toBe("LONG");
  });
});

describe("P2-E engines refuse unreasonable inputs instead of mis-calculating", () => {
  it("cargo with negative weight is never packed (it would hide an overload)", () => {
    const r = planTransport([
      { key: "a", sourceType: "X", name: "steel", quantity: 2, unitWeightKg: 900, unitVolumeM3: 1, maxDimM: 2, fragile: false },
      { key: "b", sourceType: "X", name: "ghost", quantity: 1, unitWeightKg: -900, unitVolumeM3: 1, maxDimM: 2, fragile: false },
    ], [veh("A", 1000, 20, 6), veh("B", 1000, 20, 6)], opts);
    expect(r.unassigned.find((u) => u.key === "b")?.reason).toMatch(/Invalid weight/);
    expect(r.trips.every((t) => t.weightKg > 0 && t.weightKg <= 1000)).toBe(true);
  });

  it("cargo beyond the unit limit is refused without expanding it", () => {
    const t0 = Date.now();
    const r = planTransport([{ key: "x", sourceType: "X", name: "bolts", quantity: MAX_CARGO_UNITS * 100, unitWeightKg: 0.1, unitVolumeM3: 0.001, maxDimM: 0.1, fragile: false }], [veh("A", 1000, 20, 6)], opts);
    expect(r.unassigned[0].reason).toMatch(/limit/);
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it("cutting optimiser reports invalid pieces and refuses huge workloads quickly", () => {
    const board = { materialCode: "MDF", stockLengthM: 2.44, stockWidthM: 1.22, kerfMm: 4, edgeTrimMm: 5 };
    const bad = optimizeCutting(board, [{ label: "neg", length: -1, width: 0.5, quantity: 2 }, { label: "ok", length: 1, width: 0.5, quantity: 1 }]);
    expect(bad.unplaced.some((u) => u.label === "neg" && /Invalid size/.test(u.reason))).toBe(true);
    expect(bad.boardsUsed).toBe(1);
    const t0 = Date.now();
    const huge = optimizeCutting(board, [{ label: "tile", length: 0.1, width: 0.1, quantity: MAX_CUTTING_PIECES * 50 }]);
    expect(huge.boardsUsed).toBe(0);
    expect(huge.trace.state).toBe("NEEDS_INFORMATION");
    expect(huge.unplaced[0].reason).toMatch(/Too many pieces/);
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it("timber optimiser does not expand invalid or huge member lists", () => {
    const r = optimizeTimber({ materialCode: "PINE", stockLengthM: 4, kerfMm: 3 }, [{ label: "neg", lengthM: -2, quantity: 3 }, { label: "huge", lengthM: 1, quantity: 10_000_000 }]);
    expect(r.oversize.map((m) => m.label).sort()).toEqual(["huge", "neg"]);
  });

  it("a negative paint surface raises an error and never reduces the paint quantity", () => {
    const base = runPlanningPipeline(aswanSnapshot());
    const snap = aswanSnapshot();
    const item = snap.productionItems.find((i) => i.specs.some((s) => s.kind === "PAINT_SURFACE"))!;
    const paint = item.specs.find((s) => s.kind === "PAINT_SURFACE")!;
    item.specs.push({ ...paint, id: "neg", label: "negative", lengthM: -50 });
    const r = runPlanningPipeline(snap);
    const litres = (p: typeof base) => p.production.boq.filter((b) => b.materialId === paint.materialId).reduce((s, b) => s + b.purchaseQuantity, 0);
    expect(litres(r)).toBe(litres(base));
    expect(r.issues.some((i) => i.code === "PROD_PAINT_INCOMPLETE" && i.message.includes("negative"))).toBe(true);
  });
});

describe("P2-F manpower nets out crews committed to overlapping projects", () => {
  const cat = (committed: LaborCategorySnap["committedElsewhere"]): LaborCategorySnap => ({ id: "C", key: "CARPENTER", name: "Carpenter", dailyHours: 9, breakHours: 1, maxOvertimeHours: 2, dailyRate: 800, overtimeHourlyRate: 150, currency: "EGP", headcount: 6, status: "APPROVED", rates: [], committedElsewhere: committed });
  const site = { days: 2, productiveHoursPerDay: 8, label: "2 days", start: Date.parse("2026-12-13T05:00:00Z"), end: Date.parse("2026-12-15T05:00:00Z") };
  const window = { SITE: site } as unknown as Parameters<typeof computeCrews>[2];
  const demand = [{ key: "k", laborKey: "CARPENTER", phase: "SITE" as const, operation: "INSTALL", quantity: 1, unit: "m2", hoursPerUnit: 1, hours: 64, basis: "x", state: "CALCULATED" as const }];

  it("reduces available headcount by the peak crew planned elsewhere inside the window", () => {
    const free = computeCrews(demand as never, [cat([])], window);
    expect(free.plans[0]).toMatchObject({ requiredCrew: 4, available: 6, shortfall: 0, committedElsewhere: 0 });
    const busy = computeCrews(demand as never, [cat([{ projectCode: "OTHER", day: "2026-12-13", crew: 3 }, { projectCode: "OTHER", day: "2026-12-14", crew: 4 }])], window);
    expect(busy.plans[0]).toMatchObject({ available: 2, committedElsewhere: 4, shortfall: 2 });
    expect(busy.issues.find((i) => i.code === "MANPOWER_SHORTFALL")?.message).toMatch(/committed to OTHER/);
  });

  it("ignores commitments outside the window", () => {
    expect(peakCommittedElsewhere(cat([{ projectCode: "LATER", day: "2026-12-20", crew: 6 }]), site).peak).toBe(0);
  });

  it("the default standards are unchanged by this", () => { expect(DEFAULT_STANDARDS.timezoneOffsetHours).toBe(2); });
});

describe("P2-G archive and parsing limits", () => {
  it("accepts a normal archive and rejects archive bombs from the directory alone", () => {
    expect(inspectZip(zipWith([{ name: "a.xml", csize: 100, usize: 900 }])).entries).toBe(1);
    expect(() => inspectZip(zipWith([{ name: "bomb.xml", csize: 1000, usize: 4_000_000_000 }]))).toThrow(/ratio|expands/);
    expect(() => inspectZip(zipWith(Array.from({ length: 200 }, (_, i) => ({ name: `p${i}.xml`, csize: 10_000, usize: 1_000_000 }))))).toThrow(/expands beyond/);
    expect(() => inspectZip(Buffer.from("PK\x03\x04 not really a zip"))).toThrow(/ZIP directory/);
  });

  it("times out runaway parsing", async () => {
    await expect(withTimeout(new Promise(() => undefined), 50, "Parsing")).rejects.toThrow(/timed out/);
  });
});

describe("P2-E input validators", () => {
  it("positive / non-negative / integer helpers reject bad text instead of treating it as unknown", () => {
    expect(optPositive(100).safeParse("abc").success).toBe(false);
    expect(optPositive(100).safeParse(-1).success).toBe(false);
    expect(optPositive(100).safeParse(0).success).toBe(false);
    expect(optPositive(100).safeParse(101).success).toBe(false);
    expect(optPositive(100).parse("")).toBeNull();
    expect(optPositive(100).parse("2.5")).toBe(2.5);
    expect(optNonNegative(10).safeParse(-0.01).success).toBe(false);
    expect(optInt(1, 10).safeParse(2.5).success).toBe(false);
  });
});
