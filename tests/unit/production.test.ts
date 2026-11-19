import { describe, expect, it } from "vitest";
import { optimizeCutting, estimateBoardsByArea } from "@/engines/production/cutting";
import { optimizeTimber } from "@/engines/production/timber";
import { calculatePaint } from "@/engines/production/paint";
import { calculateProduction } from "@/engines/production/boq";
import { DEFAULT_STANDARDS } from "@/engines/snapshot";
import { aswanSnapshot } from "../fixtures/aswanSnapshot";

const board = { materialCode: "MDF-18", stockLengthM: 2.44, stockWidthM: 1.22, kerfMm: 0, edgeTrimMm: 0 };

describe("board cutting optimisation", () => {
  it("places full-size panels one per board at 100% utilisation", () => {
    const r = optimizeCutting(board, [{ label: "full", length: 2.44, width: 1.22, quantity: 4 }]);
    expect(r.boardsUsed).toBe(4);
    expect(r.utilizationPct).toBe(100);
    expect(r.unplaced).toHaveLength(0);
  });

  it("nests four 1.2×0.6 panels per sheet including kerf", () => {
    const r = optimizeCutting({ ...board, kerfMm: 3 }, [{ label: "p", length: 1.2, width: 0.6, quantity: 8 }]);
    expect(r.boardsUsed).toBe(2);
    expect(r.layouts[0].placements).toHaveLength(4);
  });

  it("accounts for kerf: pieces that fit without kerf need an extra board with kerf", () => {
    const noKerf = optimizeCutting(board, [{ label: "p", length: 1.22, width: 0.61, quantity: 4 }]);
    const withKerf = optimizeCutting({ ...board, kerfMm: 4 }, [{ label: "p", length: 1.22, width: 0.61, quantity: 4 }]);
    expect(noKerf.boardsUsed).toBe(1);
    expect(withKerf.boardsUsed).toBeGreaterThan(1);
  });

  it("respects edge trim", () => {
    const r = optimizeCutting({ ...board, edgeTrimMm: 10 }, [{ label: "full", length: 2.44, width: 1.22, quantity: 1 }]);
    expect(r.boardsUsed).toBe(0);
    expect(r.unplaced).toHaveLength(1);
  });

  it("never forces oversize panels and reports them", () => {
    const r = optimizeCutting(board, [{ label: "big", length: 3, width: 1, quantity: 1 }]);
    expect(r.boardsUsed).toBe(0);
    expect(r.unplaced[0].reason).toMatch(/joint/);
    expect(r.trace.state).toBe("NEEDS_INFORMATION");
  });

  it("does not rotate grain-locked panels", () => {
    // 1.0 × 2.0 fits only if rotated (width 2.0 > 1.22)
    const locked = optimizeCutting(board, [{ label: "g", length: 1.0, width: 2.0, quantity: 1, grainLocked: true }]);
    const free = optimizeCutting(board, [{ label: "g", length: 1.0, width: 2.0, quantity: 1 }]);
    expect(locked.unplaced).toHaveLength(1);
    expect(free.boardsUsed).toBe(1);
    expect(free.layouts[0].placements[0].rotated).toBe(true);
  });

  it("reuses offcuts across different panels of the same material", () => {
    const r = optimizeCutting(board, [{ label: "a", length: 2.0, width: 1.22, quantity: 1 }, { label: "b", length: 0.44, width: 1.2, quantity: 1 }]);
    expect(r.boardsUsed).toBe(1);
  });

  it("is deterministic for identical input", () => {
    const panels = [{ label: "x", length: 0.9, width: 0.45, quantity: 7 }, { label: "y", length: 1.3, width: 0.7, quantity: 3 }];
    expect(JSON.stringify(optimizeCutting(board, panels))).toBe(JSON.stringify(optimizeCutting(board, panels)));
  });

  it("area estimate is labelled ESTIMATED", () => {
    const e = estimateBoardsByArea(board, 10, 10);
    expect(e.boards).toBe(Math.ceil((10 * 1.1) / (2.44 * 1.22)));
    expect(e.trace.state).toBe("ESTIMATED");
  });
});

describe("timber 1D cutting", () => {
  it("uses first-fit-decreasing without kerf", () => {
    const r = optimizeTimber({ materialCode: "T", stockLengthM: 4.8, kerfMm: 0 }, [{ label: "a", lengthM: 2.4, quantity: 3 }, { label: "b", lengthM: 1.2, quantity: 4 }]);
    expect(r.sticksUsed).toBe(3);
    expect(r.netLengthM).toBe(12);
  });
  it("adds kerf between cuts", () => {
    const r = optimizeTimber({ materialCode: "T", stockLengthM: 4.8, kerfMm: 3 }, [{ label: "a", lengthM: 2.4, quantity: 2 }]);
    expect(r.sticksUsed).toBe(2);
  });
  it("reports members longer than stock", () => {
    const r = optimizeTimber({ materialCode: "T", stockLengthM: 4, kerfMm: 3 }, [{ label: "long", lengthM: 5, quantity: 1 }]);
    expect(r.oversize).toHaveLength(1);
    expect(r.trace.state).toBe("NEEDS_INFORMATION");
    expect(r.trace.assumptions.join(" ")).toMatch(/qualified engineer/);
  });
});

describe("paint consumption", () => {
  it("applies Litres = Area × Coats ÷ Coverage × (1 + waste)", () => {
    const r = calculatePaint({ materialCode: "P", areaM2: 30, coats: 2, coverageM2PerL: 10, wastePct: 10, containerL: 4 });
    expect(r.netLitres).toBe(6);
    expect(r.grossLitres).toBe(6.6);
    expect(r.containers).toBe(2);
    expect(r.purchaseLitres).toBe(8);
  });
  it("rejects invalid coverage", () => {
    expect(() => calculatePaint({ materialCode: "P", areaM2: 1, coats: 1, coverageM2PerL: 0, wastePct: 0 })).toThrow();
  });
});

describe("production BOQ (Aswan demo)", () => {
  const s = aswanSnapshot();
  const r = calculateProduction(s.productionItems, s.materials, DEFAULT_STANDARDS);

  it("calculates MDF boards from the optimised cutting plan", () => {
    const mdf = r.boq.find((l) => l.code === "MDF-18" && l.method.startsWith("Optimised"))!;
    expect(mdf).toBeDefined();
    // backdrop 12 face panels 2.0×1.0 cannot share a sheet (2 × 2.0 > 2.43 usable) → ≥ 12 boards
    expect(mdf.netQuantity).toBeGreaterThanOrEqual(12);
    expect(mdf.purchaseQuantity).toBe(Math.ceil(mdf.netQuantity * 1.05 - 1e-9));
    expect(mdf.state).toBe("CALCULATED");
  });

  it("calculates black paint in 18 L pails from area × coats", () => {
    const p = r.boq.find((l) => l.code === "PNT-BLK")!;
    // (12×0.6 + 8×3) × 2 coats = 62.4 m² → 6.24 L ×1.1 = 6.864 L → 1 pail
    expect(p.purchaseQuantity).toBe(1);
    expect(p.netQuantity).toBeCloseTo(6.24 / 18, 2);
  });

  it("only estimates the podium (no drawing) and asks for information", () => {
    expect(r.boq.some((l) => l.state === "ESTIMATED" && l.itemCodes.includes("POD-01"))).toBe(true);
    expect(r.issues.some((i) => i.code === "PROD_DRAWING_MISSING" && i.question)).toBe(true);
    expect(r.issues.some((i) => i.code === "PROD_PAINT_UNSPECIFIED")).toBe(true);
  });

  it("does not invent framing for the counter", () => {
    expect(r.issues.some((i) => i.code === "PROD_FRAMING_UNSPECIFIED" && i.subjectId === "POD-01")).toBe(true);
  });

  it("uses deck area for stage installation workload", () => {
    const w = r.workloads.find((x) => x.key === "STG-01:INSTALL")!;
    expect(w.quantity).toBe(72);
  });

  it("uses packed volume for transport and flags missing packed volume", () => {
    expect(r.items.find((i) => i.code === "BKD-01")!.transportVolumeM3).toBe(6);
    expect(r.issues.some((i) => i.code === "PROD_PACKED_VOLUME_MISSING" && i.subjectId === "CNT-01")).toBe(true);
  });

  it("includes calculation traces for every BOQ line", () => {
    for (const l of r.boq) expect(r.traces[l.traceIndex]).toBeDefined();
  });
});
