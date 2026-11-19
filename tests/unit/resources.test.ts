import { describe, expect, it } from "vitest";
import { computeCrews, computeLaborDemands } from "@/engines/manpower";
import { planAv } from "@/engines/av";
import { planTransport } from "@/engines/logistics";
import { planAccommodation, nightsBetween } from "@/engines/accommodation";
import { computeBudget } from "@/engines/budget";
import { scoreRisk } from "@/engines/risk";
import { DEFAULT_STANDARDS, type LaborCategorySnap, type VehicleSnap } from "@/engines/snapshot";

const carpenter: LaborCategorySnap = { id: "c", key: "CARPENTER", name: "Carpenter", dailyHours: 8, breakHours: 1, maxOvertimeHours: 2, dailyRate: 900, overtimeHourlyRate: 150, currency: "EGP", headcount: 2, status: "APPROVED", rates: [{ activity: "PANEL_FABRICATION", unitOfWork: "m2", hoursPerUnit: 0.5, status: "APPROVED" }] };

describe("manpower", () => {
  it("hours = quantity × productivity; crew = CEILING(hours ÷ productive hours per person)", () => {
    const ld = computeLaborDemands([{ key: "X:FAB", operation: "PANEL_FABRICATION", quantity: 100, unit: "m2", basis: "t" }], [], [carpenter], DEFAULT_STANDARDS);
    expect(ld.demands[0].hours).toBe(50);
    expect(ld.demands[0].state).toBe("CALCULATED");
    const c = computeCrews(ld.demands, [carpenter], { WORKSHOP: { days: 3, productiveHoursPerDay: null, label: "" }, LOADOUT: { days: 1, productiveHoursPerDay: null, label: "" }, SITE: { days: 1, productiveHoursPerDay: 10, label: "" }, DISMANTLE: { days: 1, productiveHoursPerDay: 10, label: "" } });
    // 50 / (7 × 3) = 2.38 → 3
    expect(c.plans[0].requiredCrew).toBe(3);
    expect(c.plans[0].shortfall).toBe(1);
    expect(c.issues.some((i) => i.code === "MANPOWER_SHORTFALL")).toBe(true);
    // with 2h overtime: 50 / (9 × 3) = 1.85 → 2 (feasible)
    expect(c.plans[0].crewWithOvertime).toBe(2);
  });

  it("never invents a missing productivity rate", () => {
    const ld = computeLaborDemands([{ key: "X:PAINT", operation: "PAINTING", quantity: 10, unit: "m2", basis: "t" }], [], [carpenter], DEFAULT_STANDARDS);
    expect(ld.demands[0].hours).toBeNull();
    expect(ld.demands[0].state).toBe("NEEDS_INFORMATION");
    expect(ld.issues[0].code).toBe("LABOR_RATE_MISSING");
  });

  it("caps productive hours by venue access window", () => {
    const ld = computeLaborDemands([], [{ key: "AV", laborKey: "CARPENTER", phase: "SITE", hours: 30, basis: "x" }], [carpenter], DEFAULT_STANDARDS);
    const c = computeCrews(ld.demands, [{ ...carpenter, headcount: 10 }], { WORKSHOP: { days: 1, productiveHoursPerDay: null, label: "" }, LOADOUT: { days: 1, productiveHoursPerDay: null, label: "" }, SITE: { days: 2, productiveHoursPerDay: 5, label: "" }, DISMANTLE: { days: 1, productiveHoursPerDay: 5, label: "" } });
    expect(c.plans[0].requiredCrew).toBe(3); // 30 / (5 × 2)
  });
});

describe("AV allocation", () => {
  const eq = { id: "LED", code: "LED", category: "LED_SCREEN", model: "LED", weightKg: 7, caseVolumeM3: 0.03, powerW: 200, setupMinutes: 6, techniciansRequired: 2, rentalDailyRate: 300, currency: "EGP", ownership: "OWNED" as const, ownedQty: 50, outOfService: 2, allocatedElsewhere: [{ projectCode: "OTHER", start: new Date("2026-01-01"), end: new Date("2026-01-05"), quantity: 10 }] };
  const win = { start: new Date("2026-01-03"), end: new Date("2026-01-06") };
  it("detects inventory gaps and rental needs including bookings on other projects", () => {
    const r = planAv([{ id: "r", category: "LED_SCREEN", description: "wall", equipmentId: "LED", quantity: 40, backupQuantity: 4 }], [eq], win, 100);
    expect(r.lines[0].allocated).toBe(38);
    expect(r.lines[0].rental).toBe(6);
    expect(r.lines[0].rentalCost).toBe(6 * 300 * 3);
    expect(r.totalPowerKw).toBe(8);
    expect(r.techHours).toBe(4);
  });
  it("flags venue power overload", () => {
    const r = planAv([{ id: "r", category: "LED_SCREEN", description: "wall", equipmentId: "LED", quantity: 40, backupQuantity: 0 }], [eq], win, 5);
    expect(r.issues.some((i) => i.code === "VENUE_POWER_EXCEEDED")).toBe(true);
  });
  it("asks for a model when none is selected", () => {
    const r = planAv([{ id: "r", category: "MICROPHONE", description: "mics", equipmentId: null, quantity: 4, backupQuantity: 0 }], [eq], win, null);
    expect(r.lines[0].state).toBe("NEEDS_INFORMATION");
  });
});

describe("transport planning", () => {
  const v = (code: string, payloadKg: number, volumeM3: number, extra: Partial<VehicleSnap> = {}): VehicleSnap => ({ id: code, code, type: "TRUCK", payloadKg, volumeM3, internalLengthM: 6, internalWidthM: 2, internalHeightM: 2, dailyCost: 1000, currency: "EGP", available: true, maintenanceStatus: "OK", bookedElsewhere: [], ...extra });
  const opts = { fillFactor: 1, window: { start: new Date("2026-01-01"), end: new Date("2026-01-03") }, origin: "Cairo", destination: "Aswan", routes: [{ origin: "Cairo", destination: "Aswan", distanceKm: 880, durationHours: 13, approved: true, source: "x" }], driversAvailable: 5 };

  it("respects payload (weight-bound load)", () => {
    const r = planTransport([{ key: "steel", sourceType: "X", name: "steel", quantity: 3, unitWeightKg: 900, unitVolumeM3: 1, maxDimM: 2, fragile: false }], [v("A", 2000, 30), v("B", 2000, 30)], opts);
    expect(r.trips).toHaveLength(2);
    expect(r.trips.every((t) => t.weightKg <= 2000)).toBe(true);
  });

  it("respects volume (volume-bound load)", () => {
    const r = planTransport([{ key: "foam", sourceType: "X", name: "foam", quantity: 3, unitWeightKg: 10, unitVolumeM3: 8, maxDimM: 2, fragile: false }], [v("A", 5000, 20), v("B", 5000, 20)], opts);
    expect(r.trips).toHaveLength(2);
  });

  it("right-sizes to the smallest suitable vehicle and recommends a backup", () => {
    const r = planTransport([{ key: "box", sourceType: "X", name: "box", quantity: 1, unitWeightKg: 100, unitVolumeM3: 1, maxDimM: 1, fragile: false }], [v("BIG", 10000, 45), v("SMALL", 1000, 4), v("MID", 3000, 15)], opts);
    expect(r.trips[0].vehicleCode).toBe("SMALL");
    expect(r.backupVehicle?.code).toBe("MID");
  });

  it("excludes unavailable / booked vehicles and reports excess cargo", () => {
    const r = planTransport([{ key: "box", sourceType: "X", name: "box", quantity: 2, unitWeightKg: 900, unitVolumeM3: 1, maxDimM: 1, fragile: false }], [v("A", 1000, 10), v("B", 1000, 10, { available: false }), v("C", 1000, 10, { bookedElsewhere: [{ projectCode: "Q", start: new Date("2026-01-02"), end: new Date("2026-01-04") }] })], opts);
    expect(r.trips).toHaveLength(1);
    expect(r.unassigned).toHaveLength(1);
    expect(r.issues.some((i) => i.code === "CARGO_UNASSIGNED")).toBe(true);
  });

  it("rejects items longer than every vehicle", () => {
    const r = planTransport([{ key: "beam", sourceType: "X", name: "beam", quantity: 1, unitWeightKg: 50, unitVolumeM3: 0.2, maxDimM: 12, fragile: false }], [v("A", 5000, 20)], opts);
    expect(r.unassigned[0].reason).toMatch(/does not fit/);
  });

  it("never fabricates travel time", () => {
    const r = planTransport([], [v("A", 5000, 20)], { ...opts, routes: [] });
    expect(r.routeState).toBe("NEEDS_INFORMATION");
    expect(r.issues.some((i) => i.code === "ROUTE_DURATION_MISSING")).toBe(true);
  });
});

describe("accommodation", () => {
  const hotels = [{ id: "H", name: "Hotel", roomTypes: [{ id: "T", name: "Twin", capacity: 2, nightlyRate: 1000, currency: "EGP", roomsAvailable: 5 }] }];
  const g = (id: string, name: string | null, label: string | null, i: string, o: string, status = "CONFIRMED") => ({ id, guestName: name, personKey: name, department: "X", jobRole: "x", hotelId: "H", roomTypeId: "T", roomLabel: label, sharedRoom: !!label, checkIn: new Date(i), checkOut: new Date(o), bookingStatus: status, confirmationRef: null });
  it("counts nights between dates", () => { expect(nightsBetween(new Date("2026-12-12T12:00Z"), new Date("2026-12-17T10:00Z"))).toBe(5); });
  it("groups shared rooms and computes room nights and cost", () => {
    const r = planAccommodation([g("1", "A", "R1", "2026-12-12", "2026-12-15"), g("2", "B", "R1", "2026-12-12", "2026-12-15"), g("3", "C", null, "2026-12-13", "2026-12-15")], hotels);
    expect(r.roomCount).toBe(2);
    expect(r.roomNights).toBe(5);
    expect(r.costByCurrency.EGP).toBe(5000);
  });
  it("detects overlaps, capacity, missing names and wrong dates", () => {
    const r = planAccommodation([g("1", "A", "R1", "2026-12-12", "2026-12-15"), g("2", "B", "R1", "2026-12-12", "2026-12-15"), g("3", "C", "R1", "2026-12-12", "2026-12-15"), g("4", "A", null, "2026-12-14", "2026-12-16"), g("5", null, null, "2026-12-16", "2026-12-15", "REQUESTED")], hotels);
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain("ACC_CAPACITY");
    expect(codes).toContain("ACC_OVERLAP");
    expect(codes).toContain("ACC_NAME_MISSING");
    expect(codes).toContain("ACC_DATES_INVALID");
    expect(codes).toContain("ACC_UNCONFIRMED");
  });
});

describe("budget", () => {
  const line = (amount: number, currency: string) => ({ category: "MATERIALS", description: "x", quantity: 1, unit: "u", unitCost: amount, amount, currency, basis: "ESTIMATE" as const, source: "t" });
  it("never silently combines currencies", () => {
    const r = computeBudget([line(1000, "EGP"), line(100, "USD")], { budgetAmount: 5000, budgetCurrency: "EGP", contingencyPct: 0, unpriced: [], rates: [] });
    expect(r.byCurrency).toHaveLength(2);
    expect(r.totalInBudgetCurrency).toBeNull();
    expect(r.unconvertible).toEqual(["USD"]);
  });
  it("converts only with an explicit stored rate and records it", () => {
    const r = computeBudget([line(1000, "EGP"), line(100, "USD")], { budgetAmount: 5000, budgetCurrency: "EGP", contingencyPct: 10, unpriced: [], rates: [{ from: "USD", to: "EGP", rate: 50, source: "Finance", rateDate: new Date("2026-01-01") }] });
    // EGP 1000 + 100 contingency; USD 100 + 10 = 110 × 50 = 5500
    expect(r.totalInBudgetCurrency).toBe(6600);
    expect(r.conversions[0].rate).toBe(50);
    expect(r.variance).toBe(-1600);
    expect(r.issues.some((i) => i.code === "BUDGET_EXCEEDED")).toBe(true);
  });
});

describe("risk scoring", () => {
  it("severity = probability × impact with configurable thresholds", () => {
    expect(scoreRisk(2, 2, DEFAULT_STANDARDS.riskThresholds)).toEqual({ severity: 4, level: "LOW" });
    expect(scoreRisk(2, 3, DEFAULT_STANDARDS.riskThresholds).level).toBe("MEDIUM");
    expect(scoreRisk(3, 4, DEFAULT_STANDARDS.riskThresholds).level).toBe("HIGH");
    expect(scoreRisk(4, 5, DEFAULT_STANDARDS.riskThresholds).level).toBe("CRITICAL");
    expect(() => scoreRisk(6, 1, DEFAULT_STANDARDS.riskThresholds)).toThrow();
  });
});
