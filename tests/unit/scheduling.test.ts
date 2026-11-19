import { describe, expect, it } from "vitest";
import { Calendar } from "@/engines/scheduling/calendar";
import { schedule, topoSort } from "@/engines/scheduling/scheduler";

const H = 3600000;
const t0 = Date.UTC(2026, 0, 5, 0, 0); // Monday 00:00 UTC
const cont = Calendar.continuous();

describe("calendar", () => {
  const cal = Calendar.daily("work", new Date(t0), new Date(t0 + 5 * 24 * H), 8, 17, 0);
  it("adds working hours across days", () => {
    const start = cal.nextWorking(t0); // Mon 08:00
    expect(start).toBe(t0 + 8 * H);
    expect(cal.addWork(start, 9)).toBe(t0 + 17 * H);
    expect(cal.addWork(start, 10)).toBe(t0 + 24 * H + 9 * H); // Tue 09:00
  });
  it("subtracts working hours", () => {
    expect(cal.subtractWork(t0 + 24 * H + 9 * H, 10)).toBe(t0 + 8 * H);
  });
  it("honours timezone offset and workdays", () => {
    const c = Calendar.daily("tz", new Date(t0), new Date(t0 + 7 * 24 * H), 8, 17, 2, [1]); // Mondays only, UTC+2
    expect(c.intervals).toHaveLength(1);
    expect(c.intervals[0].start).toBe(t0 + 6 * H);
  });
  it("returns Infinity when work exceeds the calendar", () => {
    expect(cal.addWork(cal.nextWorking(t0), 1000)).toBe(Infinity);
  });
});

describe("CPM & dependencies", () => {
  it("computes FS chain, critical path and float", () => {
    const r = schedule([
      { id: "A", name: "A", durationHours: 4, calendar: cont },
      { id: "B", name: "B", durationHours: 2, calendar: cont },
      { id: "C", name: "C", durationHours: 6, calendar: cont },
      { id: "D", name: "D", durationHours: 1, calendar: cont },
    ], [{ from: "A", to: "B", type: "FS", lagHours: 0 }, { from: "A", to: "C", type: "FS", lagHours: 0 }, { from: "B", to: "D", type: "FS", lagHours: 0 }, { from: "C", to: "D", type: "FS", lagHours: 0 }], {}, t0);
    const g = (id: string) => r.tasks.find((t) => t.id === id)!;
    expect(g("D").start).toBe(t0 + 10 * H);
    expect(r.makespanHours).toBe(11);
    expect(r.criticalPath).toEqual(["A", "C", "D"]);
    expect(g("B").floatHours).toBe(4);
  });

  it("supports SS, FF and SF with lag", () => {
    const r = schedule([
      { id: "A", name: "A", durationHours: 10, calendar: cont },
      { id: "SS", name: "SS", durationHours: 3, calendar: cont },
      { id: "FF", name: "FF", durationHours: 3, calendar: cont },
      { id: "SF", name: "SF", durationHours: 3, calendar: cont },
    ], [{ from: "A", to: "SS", type: "SS", lagHours: 2 }, { from: "A", to: "FF", type: "FF", lagHours: 1 }, { from: "A", to: "SF", type: "SF", lagHours: 5 }], {}, t0);
    const g = (id: string) => r.tasks.find((t) => t.id === id)!;
    expect(g("SS").start).toBe(t0 + 2 * H);
    expect(g("FF").finish).toBe(t0 + 11 * H);
    expect(g("SF").finish).toBe(t0 + 5 * H);
  });

  it("detects cycles", () => {
    expect(topoSort(["A", "B"], [{ from: "A", to: "B", type: "FS", lagHours: 0 }, { from: "B", to: "A", type: "FS", lagHours: 0 }]).cycle).toEqual(["A", "B"]);
    const r = schedule([{ id: "A", name: "A", durationHours: 1, calendar: cont }, { id: "B", name: "B", durationHours: 1, calendar: cont }], [{ from: "A", to: "B", type: "FS", lagHours: 0 }, { from: "B", to: "A", type: "FS", lagHours: 0 }], {}, t0);
    expect(r.feasible).toBe(false);
    expect(r.conflicts[0].type).toBe("CYCLE");
  });
});

describe("resource-constrained scheduling", () => {
  it("delays tasks competing for the same crew and reports the delay", () => {
    const r = schedule([
      { id: "A", name: "A", durationHours: 4, calendar: cont, resource: { key: "CARP", units: 3 } },
      { id: "B", name: "B", durationHours: 4, calendar: cont, resource: { key: "CARP", units: 3 } },
    ], [], { CARP: 4 }, t0);
    const starts = r.tasks.map((t) => t.start).sort();
    expect(starts).toEqual([t0, t0 + 4 * H]);
    expect(r.conflicts.some((c) => c.type === "RESOURCE_DELAY")).toBe(true);
  });

  it("runs in parallel when capacity allows", () => {
    const r = schedule([
      { id: "A", name: "A", durationHours: 4, calendar: cont, resource: { key: "CARP", units: 2 } },
      { id: "B", name: "B", durationHours: 4, calendar: cont, resource: { key: "CARP", units: 2 } },
    ], [], { CARP: 4 }, t0);
    expect(r.tasks.every((t) => t.start === t0)).toBe(true);
  });

  it("reports impossible crew demand but keeps the task", () => {
    const r = schedule([{ id: "A", name: "A", durationHours: 4, calendar: cont, resource: { key: "CARP", units: 6 } }], [], { CARP: 4 }, t0);
    expect(r.tasks).toHaveLength(1);
    expect(r.conflicts.some((c) => c.type === "CAPACITY")).toBe(true);
  });

  it("reports deadline violations instead of dropping tasks", () => {
    const r = schedule([{ id: "A", name: "Setup", durationHours: 10, calendar: cont, deadline: t0 + 5 * H, deadlineLabel: "event start" }], [], {}, t0);
    expect(r.tasks[0].finish).toBe(t0 + 10 * H);
    expect(r.feasible).toBe(false);
    expect(r.conflicts[0].message).toMatch(/5\.0 h after event start/);
  });

  it("flags fixed-date milestones that predecessors cannot meet", () => {
    const r = schedule([{ id: "A", name: "A", durationHours: 10, calendar: cont }, { id: "E", name: "Event", durationHours: 0, calendar: cont, fixedStart: t0 + 6 * H }], [{ from: "A", to: "E", type: "FS", lagHours: 0 }], {}, t0);
    expect(r.conflicts.some((c) => c.type === "FIXED_DATE")).toBe(true);
  });
});
