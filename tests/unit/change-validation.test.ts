import { describe, expect, it } from "vitest";
import { checkProjectDates, normaliseChanges, parseChangeDate, projectDatesAfter } from "@/server/services/change-validation";

describe("P1-3 / P2-B change-request validation", () => {
  it("rejects fractional values for integer fields", () => {
    expect(() => normaliseChanges("ProductionItem", [{ field: "quantity", to: 2.5 }])).toThrow(/whole number/);
    expect(() => normaliseChanges("ProductionItem", [{ field: "quantity", to: "2.5" }])).toThrow(/whole number/);
    expect(() => normaliseChanges("Project", [{ field: "participants", to: 10.1 }])).toThrow(/whole number/);
    expect(() => normaliseChanges("EquipmentRequirement", [{ field: "backupQuantity", to: 0.5 }])).toThrow(/whole number/);
  });

  it("requires positive, finite, bounded dimensions and quantities", () => {
    for (const bad of [0, -1, "-3", "abc", "", NaN, Infinity, 1e9, true, null]) expect(() => normaliseChanges("ProductionItem", [{ field: "widthM", to: bad as never }])).toThrow();
    expect(() => normaliseChanges("ProductionItem", [{ field: "quantity", to: 0 }])).toThrow(/between 1 and 1000/);
    expect(() => normaliseChanges("EquipmentRequirement", [{ field: "quantity", to: -2 }])).toThrow();
    expect(normaliseChanges("ProductionItem", [{ field: "widthM", to: "10" }, { field: "quantity", to: "3" }])).toEqual([{ field: "widthM", to: 10 }, { field: "quantity", to: 3 }]);
  });

  it("validates decimals for money and strict booleans", () => {
    expect(normaliseChanges("Project", [{ field: "budgetAmount", to: "1,250,000.50" }])).toEqual([{ field: "budgetAmount", to: 1250000.5 }]);
    expect(() => normaliseChanges("Project", [{ field: "budgetAmount", to: 10.123 }])).toThrow(/2 decimals/);
    expect(() => normaliseChanges("Project", [{ field: "budgetAmount", to: -1 }])).toThrow(/negative/);
    expect(normaliseChanges("Vehicle", [{ field: "available", to: "false" }])).toEqual([{ field: "available", to: false }]);
    expect(() => normaliseChanges("Vehicle", [{ field: "available", to: "yes" }])).toThrow(/true or false/);
  });

  it("rejects unknown fields, duplicates and unsupported entities", () => {
    expect(() => normaliseChanges("ProductionItem", [{ field: "approvalStatus", to: "APPROVED" }])).toThrow(/cannot be changed/);
    expect(() => normaliseChanges("ProductionItem", [{ field: "widthM", to: 1 }, { field: "widthM", to: 2 }])).toThrow(/more than once/);
    expect(() => normaliseChanges("Task", [{ field: "x", to: 1 }])).toThrow(/Unsupported/);
  });

  it("parses Cairo-local and ISO dates and rejects garbage", () => {
    expect(parseChangeDate("2026-12-15T09:00").toISOString()).toBe("2026-12-15T07:00:00.000Z"); // Africa/Cairo UTC+2 in December
    expect(parseChangeDate("2026-12-15T07:00:00.000Z").toISOString()).toBe("2026-12-15T07:00:00.000Z");
    for (const bad of ["2026-13-45", "tomorrow", "", "2026-12-15T25:00", "1850-01-01T00:00"]) expect(() => parseChangeDate(bad)).toThrow();
  });

  it("enforces project date order (eventStart must not be after eventEnd, setup before event)", () => {
    const cur = { setupStart: new Date("2026-12-13T05:00:00Z"), setupEnd: new Date("2026-12-14T21:00:00Z"), eventStart: new Date("2026-12-15T07:00:00Z"), eventEnd: new Date("2026-12-16T16:00:00Z"), dismantleStart: new Date("2026-12-16T16:00:00Z"), dismantleEnd: new Date("2026-12-17T10:00:00Z") };
    expect(() => checkProjectDates(cur)).not.toThrow();
    expect(() => projectDatesAfter(cur, normaliseChanges("Project", [{ field: "eventStart", to: "2026-12-17T09:00" }]))).toThrow(/Event start must be before event end/);
    expect(() => projectDatesAfter(cur, normaliseChanges("Project", [{ field: "eventStart", to: "2026-12-14T09:00" }]))).toThrow(/Setup must end before the event starts/);
    expect(() => projectDatesAfter(cur, normaliseChanges("Project", [{ field: "eventEnd", to: "2026-12-18T09:00" }]))).toThrow(/Dismantle cannot start before the event ends/);
    expect(() => projectDatesAfter(cur, normaliseChanges("Project", [{ field: "setupStart", to: "2026-12-12T07:00" }]))).not.toThrow();
  });
});
