/**
 * Production BOQ engine (spec §8).
 * Turns production items + their drawing-derived specifications into:
 *  - material BOQ lines (boards via cutting optimisation, timber via 1D cutting, paint, accessories)
 *  - per-item metrics (areas, lengths, weight, transport volume)
 *  - labour workloads for the manpower engine
 * Missing specifications produce Issues and ESTIMATED / NEEDS_INFORMATION states — never invented values.
 */
import { checkRange, RANGES } from "../units";
import { ceilSafe, round, trace, type CalcTrace, type DataState, type Issue } from "../trace";
import type { MaterialSnap, OperationKey, ProductionItemSnap, Standards } from "../snapshot";
import { estimateBoardsByArea, optimizeCutting, type CuttingResult } from "./cutting";
import { optimizeTimber, type TimberResult } from "./timber";
import { calculatePaint } from "./paint";

export interface BoqLine {
  materialId: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  netQuantity: number;
  wastePct: number;
  grossQuantity: number;
  purchaseQuantity: number;
  unitCost: number | null;
  currency: string;
  cost: number | null;
  state: DataState;
  method: string;
  itemCodes: string[];
  itemIds: string[];
  traceIndex: number;
  leadTimeDays: number | null;
  supplierName: string | null;
  materialStatus: string;
}

export interface ItemMetrics {
  itemId: string;
  code: string;
  name: string;
  category: string;
  faceAreaM2: number | null;
  panelAreaM2: number;
  paintAreaM2: number;
  frameLengthM: number;
  weightKg: number | null;
  transportVolumeM3: number | null;
  /** longest single component to transport (m) */
  longestComponentM: number | null;
  state: DataState;
  installationDay: number | null;
}

export interface Workload {
  key: string;
  operation: OperationKey;
  itemId?: string;
  itemCode?: string;
  quantity: number;
  unit: string;
  basis: string;
}

export interface ProductionResult {
  boq: BoqLine[];
  cutting: { materialId: string; code: string; result: CuttingResult }[];
  timber: { materialId: string; code: string; result: TimberResult }[];
  items: ItemMetrics[];
  workloads: Workload[];
  traces: CalcTrace[];
  issues: Issue[];
}

const PAINT_FINISH = /paint|lacquer|spray|primer|دهان/i;

export function calculateProduction(items: ProductionItemSnap[], materials: MaterialSnap[], standards: Standards): ProductionResult {
  const mat = new Map(materials.map((m) => [m.id, m]));
  const traces: CalcTrace[] = [];
  const issues: Issue[] = [];
  const boq: BoqLine[] = [];
  const metrics: ItemMetrics[] = [];
  const workloads: Workload[] = [];

  const panelsByMat = new Map<string, { label: string; length: number; width: number; quantity: number; grainLocked: boolean; itemId: string; itemCode: string }[]>();
  const membersByMat = new Map<string, { label: string; lengthM: number; quantity: number; itemId: string; itemCode: string }[]>();
  const paintByMat = new Map<string, { area: number; coats: number; itemId: string; itemCode: string; estimated: boolean }[]>();
  const accessoriesByMat = new Map<string, { qty: number; itemId: string; itemCode: string }[]>();
  const estimatedBoards: { materialId: string; area: number; itemId: string; itemCode: string }[] = [];

  const push = <T>(map: Map<string, T[]>, key: string, v: T) => { const a = map.get(key) ?? []; a.push(v); map.set(key, a); };

  for (const it of [...items].sort((a, b) => a.code.localeCompare(b.code))) {
    const q = Math.max(1, it.quantity);
    let state: DataState = it.drawingStatus === "APPROVED" ? "CALCULATED" : "ESTIMATED";
    const dimsKnown = it.widthM != null && it.heightM != null;
    if (!dimsKnown) {
      state = "NEEDS_INFORMATION";
      issues.push({ severity: "error", code: "PROD_DIMENSIONS_MISSING", department: "PRODUCTION", subjectType: "ProductionItem", subjectId: it.id, message: `${it.code} ${it.name}: width/height not specified`, question: `What are the overall width and height of "${it.name}" (in metres)?` });
    }
    for (const [v, label] of [[it.widthM, "width"], [it.heightM, "height"], [it.depthM, "depth"]] as const) {
      const msg = checkRange(v, { ...RANGES.productionDimensionM, label: `${it.code} ${label}` });
      if (msg) issues.push({ severity: "warning", code: "PROD_RANGE", department: "PRODUCTION", subjectType: "ProductionItem", subjectId: it.id, message: msg });
    }
    if (it.drawingStatus === "MISSING") {
      issues.push({ severity: "warning", code: "PROD_DRAWING_MISSING", department: "PRODUCTION", subjectType: "ProductionItem", subjectId: it.id, message: `${it.code} ${it.name}: technical drawing not uploaded — quantities are estimates`, question: `Please upload the technical drawing for "${it.name}" (PDF or image).` });
    }
    if (it.engineeringApprovalRequired) {
      issues.push({ severity: "info", code: "PROD_ENGINEERING_APPROVAL", department: "PRODUCTION", subjectType: "ProductionItem", subjectId: it.id, message: `${it.code}: structural / load-bearing design requires approval by a qualified engineer` });
    }

    const panels = it.specs.filter((s) => s.kind === "PANEL");
    const members = it.specs.filter((s) => s.kind === "FRAME_MEMBER");
    const paints = it.specs.filter((s) => s.kind === "PAINT_SURFACE");
    const accessories = it.specs.filter((s) => s.kind === "ACCESSORY");

    let panelArea = 0;
    for (const p of panels) {
      const mId = p.materialId ?? it.boardMaterialId;
      if (!mId || p.lengthM == null || p.widthM == null || !(p.lengthM > 0 && p.widthM > 0 && p.quantity > 0)) {
        issues.push({ severity: "error", code: "PROD_PANEL_INCOMPLETE", department: "PRODUCTION", subjectType: "ProductionItem", subjectId: it.id, message: `${it.code} panel "${p.label}" is missing material or dimensions` });
        state = "NEEDS_INFORMATION";
        continue;
      }
      const m = mat.get(mId);
      panelArea += p.lengthM * p.widthM * p.quantity * q;
      push(panelsByMat, mId, { label: `${it.code}/${p.label}`, length: p.lengthM, width: p.widthM, quantity: p.quantity * q, grainLocked: !!m?.grainDirection, itemId: it.id, itemCode: it.code });
    }
    if (panels.length === 0 && dimsKnown) {
      if (it.boardMaterialId) {
        estimatedBoards.push({ materialId: it.boardMaterialId, area: it.widthM! * it.heightM! * q, itemId: it.id, itemCode: it.code });
        panelArea += it.widthM! * it.heightM! * q;
      } else if (!["FLOORING", "SIGNAGE", "BRANDING_INSTALL"].includes(it.category)) {
        issues.push({ severity: "warning", code: "PROD_BOARD_MATERIAL_MISSING", department: "PRODUCTION", subjectType: "ProductionItem", subjectId: it.id, message: `${it.code}: board material not specified`, question: `Which board material and thickness is "${it.name}" made of?` });
      }
    }

    let frameLen = 0;
    for (const f of members) {
      if (!f.materialId || f.lengthM == null || !(f.lengthM > 0 && f.quantity > 0)) {
        issues.push({ severity: "error", code: "PROD_MEMBER_INCOMPLETE", department: "PRODUCTION", subjectType: "ProductionItem", subjectId: it.id, message: `${it.code} frame member "${f.label}" is missing material or length` });
        continue;
      }
      frameLen += f.lengthM * f.quantity * q;
      push(membersByMat, f.materialId, { label: `${it.code}/${f.label}`, lengthM: f.lengthM, quantity: f.quantity * q, itemId: it.id, itemCode: it.code });
    }
    if (members.length === 0 && ["STAGE", "BACKDROP", "BOOTH", "PODIUM", "DECORATIVE"].includes(it.category)) {
      issues.push({ severity: "warning", code: "PROD_FRAMING_UNSPECIFIED", department: "PRODUCTION", subjectType: "ProductionItem", subjectId: it.id, message: `${it.code}: framing members not specified — timber is not calculated (the system does not invent structural framing)`, question: `Please list the frame members (material, length, quantity) for "${it.name}" from the approved drawing.` });
    }

    let paintArea = 0;
    let coatedArea = 0;
    for (const p of paints) {
      if (!p.materialId || p.lengthM == null || p.widthM == null || !(p.lengthM > 0 && p.widthM > 0 && p.quantity > 0 && p.sides > 0)) {
        issues.push({ severity: "error", code: "PROD_PAINT_INCOMPLETE", department: "PRODUCTION", subjectType: "ProductionItem", subjectId: it.id, message: `${it.code} paint surface "${p.label}" is missing product or dimensions` });
        continue;
      }
      const area = p.lengthM * p.widthM * p.sides * p.quantity * q;
      const m = mat.get(p.materialId);
      const coats = p.coats ?? it.paintCoats ?? (m?.category === "PRIMER" ? 1 : null);
      if (coats == null) {
        issues.push({ severity: "error", code: "PROD_COATS_MISSING", department: "PRODUCTION", subjectType: "ProductionItem", subjectId: it.id, message: `${it.code}: number of paint coats not specified`, question: `How many coats of paint are required for "${it.name}"?` });
        continue;
      }
      if (m?.category === "PAINT") { paintArea += area; coatedArea += area * coats; }
      push(paintByMat, p.materialId, { area, coats, itemId: it.id, itemCode: it.code, estimated: false });
    }
    if (paints.length === 0 && it.finishing && PAINT_FINISH.test(it.finishing)) {
      issues.push({ severity: "warning", code: "PROD_PAINT_UNSPECIFIED", department: "PRODUCTION", subjectType: "ProductionItem", subjectId: it.id, message: `${it.code}: finishing "${it.finishing}" requires paint, but paint surfaces / product are not specified`, question: `Which paint product and which surfaces (and sides) of "${it.name}" are painted?` });
    }

    for (const a of accessories) {
      if (!a.materialId) continue;
      push(accessoriesByMat, a.materialId, { qty: a.quantity * q, itemId: it.id, itemCode: it.code });
    }

    // weight from boards + timber unit weights (only when material weights are known)
    let weight: number | null = 0;
    for (const p of panels) {
      const m = mat.get(p.materialId ?? it.boardMaterialId ?? "");
      if (!m?.weightPerUnitKg || !m.stockLengthM || !m.stockWidthM || p.lengthM == null || p.widthM == null) { weight = null; break; }
      weight += (m.weightPerUnitKg / (m.stockLengthM * m.stockWidthM)) * p.lengthM * p.widthM * p.quantity * q;
    }
    if (weight !== null) for (const f of members) {
      const m = mat.get(f.materialId ?? "");
      if (!m?.weightPerUnitKg || !m.stockLengthM || f.lengthM == null) { weight = null; break; }
      weight += (m.weightPerUnitKg / m.stockLengthM) * f.lengthM * f.quantity * q;
    }
    if (panels.length === 0 && members.length === 0) weight = null;
    if (it.packedWeightKg != null) weight = it.packedWeightKg;
    let volume: number | null = null;
    if (it.packedVolumeM3 != null) volume = it.packedVolumeM3 * q;
    else if (dimsKnown && it.depthM != null) {
      volume = it.widthM! * it.heightM! * it.depthM * q;
      issues.push({ severity: "warning", code: "PROD_PACKED_VOLUME_MISSING", department: "PRODUCTION", subjectType: "ProductionItem", subjectId: it.id, message: `${it.code}: packed transport volume not specified — assembled bounding box (${round(volume, 2)} m³) used as an estimate`, question: `What is the packed (knocked-down) transport volume of "${it.name}" in m³?` });
    } else if (dimsKnown) {
      issues.push({ severity: "warning", code: "PROD_DEPTH_MISSING", department: "PRODUCTION", subjectType: "ProductionItem", subjectId: it.id, message: `${it.code}: depth / packed size unknown — transport volume cannot be calculated`, question: `What is the packed (transport) volume of "${it.name}"?` });
    }

    // installed area: deck area for stages/floors/podia, face area otherwise
    const deck = ["STAGE", "FLOORING"].includes(it.category);
    const face = dimsKnown ? (deck ? (it.depthM != null ? it.widthM! * it.depthM * q : null) : it.widthM! * it.heightM! * q) : null;
    if (deck && dimsKnown && it.depthM == null) issues.push({ severity: "error", code: "PROD_DECK_DEPTH_MISSING", department: "PRODUCTION", subjectType: "ProductionItem", subjectId: it.id, message: `${it.code}: stage/floor depth missing — deck area unknown`, question: `What is the depth of "${it.name}" (m)?` });
    metrics.push({ itemId: it.id, code: it.code, name: it.name, category: it.category, faceAreaM2: face === null ? null : round(face, 3), panelAreaM2: round(panelArea, 3), paintAreaM2: round(paintArea, 3), frameLengthM: round(frameLen, 3), weightKg: weight === null ? null : round(weight, 1), transportVolumeM3: volume === null ? null : round(volume, 3), longestComponentM: it.specs.some((s) => s.kind === "PANEL" || s.kind === "FRAME_MEMBER") ? Math.max(...it.specs.filter((s) => s.kind === "PANEL" || s.kind === "FRAME_MEMBER").map((s) => Math.max(s.lengthM ?? 0, s.widthM ?? 0))) : dimsKnown ? Math.max(it.widthM!, it.heightM!, it.depthM ?? 0) : null, state, installationDay: it.installationDay });

    if (panelArea > 0) workloads.push({ key: `${it.code}:FAB`, operation: "PANEL_FABRICATION", itemId: it.id, itemCode: it.code, quantity: round(panelArea, 3), unit: "m2", basis: "Panel area to cut, edge and assemble" });
    if (frameLen > 0) workloads.push({ key: `${it.code}:FRAME`, operation: "FRAME_ASSEMBLY", itemId: it.id, itemCode: it.code, quantity: round(frameLen, 3), unit: "m", basis: "Frame member length" });
    if (coatedArea > 0) workloads.push({ key: `${it.code}:PAINT`, operation: "PAINTING", itemId: it.id, itemCode: it.code, quantity: round(coatedArea, 3), unit: "m2", basis: "Painted area × coats" });
    if (face) workloads.push({ key: `${it.code}:INSTALL`, operation: "INSTALLATION", itemId: it.id, itemCode: it.code, quantity: round(face, 3), unit: "m2", basis: deck ? "Installed deck area (W × D)" : "Installed face area (W × H)" });
  }

  // ── boards: optimised cutting per material ──
  const cuttingOut: ProductionResult["cutting"] = [];
  for (const [mId, panels] of [...panelsByMat.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const m = mat.get(mId);
    if (!m || !m.stockLengthM || !m.stockWidthM) {
      issues.push({ severity: "error", code: "MAT_BOARD_SIZE_MISSING", department: "PRODUCTION", subjectType: "Material", subjectId: mId, message: `Board material ${m?.code ?? mId} has no standard sheet dimensions in the material library` });
      continue;
    }
    const res = optimizeCutting({ materialCode: m.code, stockLengthM: m.stockLengthM, stockWidthM: m.stockWidthM, kerfMm: m.kerfMm ?? 3, edgeTrimMm: m.edgeTrimMm ?? 0 }, panels);
    if (m.kerfMm == null) res.trace.assumptions.push("Material has no kerf in library — 3 mm assumed; please confirm");
    res.unplaced.forEach((u) => issues.push({ severity: "error", code: "CUT_PANEL_OVERSIZE", department: "PRODUCTION", subjectType: "Material", subjectId: mId, message: `${u.label}: ${u.reason}` }));
    traces.push(res.trace);
    cuttingOut.push({ materialId: mId, code: m.code, result: res });
    const wastePct = m.wasteFactorPct;
    const purchase = ceilSafe(res.boardsUsed * (1 + wastePct / 100));
    boq.push(line(m, res.boardsUsed, wastePct, res.boardsUsed * (1 + wastePct / 100), purchase, "Optimised cutting plan + breakage allowance", res.trace.state === "CALCULATED" ? "CALCULATED" : "NEEDS_INFORMATION", panels, traces.length - 1));
  }
  // area estimates for items without panel breakdown
  const estByMat = new Map<string, typeof estimatedBoards>();
  estimatedBoards.forEach((e) => push(estByMat, e.materialId, e));
  for (const [mId, list] of estByMat) {
    const m = mat.get(mId);
    if (!m?.stockLengthM || !m.stockWidthM) continue;
    const area = list.reduce((s, e) => s + e.area, 0);
    const wastePct = Math.max(m.wasteFactorPct, standards.defaultWastePct);
    const est = estimateBoardsByArea({ materialCode: m.code, stockLengthM: m.stockLengthM, stockWidthM: m.stockWidthM, kerfMm: m.kerfMm ?? 3, edgeTrimMm: m.edgeTrimMm ?? 0 }, area, wastePct);
    traces.push(est.trace);
    boq.push(line(m, round(area / (m.stockLengthM * m.stockWidthM), 2), wastePct, est.boards, est.boards, "Surface-area estimate (no approved panel breakdown)", "ESTIMATED", list.map((e) => ({ itemId: e.itemId, itemCode: e.itemCode })), traces.length - 1));
  }

  // ── timber ──
  const timberOut: ProductionResult["timber"] = [];
  for (const [mId, members] of [...membersByMat.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const m = mat.get(mId);
    if (!m || !m.stockLengthM) {
      issues.push({ severity: "error", code: "MAT_STOCK_LENGTH_MISSING", department: "PRODUCTION", subjectType: "Material", subjectId: mId, message: `Timber/profile ${m?.code ?? mId} has no stock length in the material library` });
      continue;
    }
    const res = optimizeTimber({ materialCode: m.code, stockLengthM: m.stockLengthM, kerfMm: m.kerfMm ?? 3 }, members);
    res.oversize.forEach((o) => issues.push({ severity: "error", code: "TIMBER_OVERSIZE", department: "PRODUCTION", message: `${o.label}: ${o.lengthM} m exceeds stock length ${m.stockLengthM} m — specify a splice` }));
    traces.push(res.trace);
    timberOut.push({ materialId: mId, code: m.code, result: res });
    const purchase = ceilSafe(res.sticksUsed * (1 + m.wasteFactorPct / 100));
    boq.push(line(m, res.sticksUsed, m.wasteFactorPct, res.sticksUsed * (1 + m.wasteFactorPct / 100), purchase, "1D cutting stock (FFD) + allowance", res.trace.state === "CALCULATED" ? "CALCULATED" : "NEEDS_INFORMATION", members, traces.length - 1));
  }

  // ── paint & primer ──
  for (const [mId, list] of [...paintByMat.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const m = mat.get(mId);
    if (!m) continue;
    if (!m.coverageM2PerL) {
      issues.push({ severity: "error", code: "MAT_COVERAGE_MISSING", department: "PRODUCTION", subjectType: "Material", subjectId: mId, message: `${m.code}: manufacturer coverage (m²/L) missing in material library`, question: `What is the manufacturer coverage rate of ${m.name} in m² per litre?` });
      continue;
    }
    // coats can differ between surfaces → sum area×coats
    const areaCoats = list.reduce((s, p) => s + p.area * p.coats, 0);
    const res = calculatePaint({ materialCode: m.code, areaM2: round(areaCoats, 3), coats: 1, coverageM2PerL: m.coverageM2PerL, wastePct: m.wasteFactorPct, containerL: containerFromUnit(m.unit) });
    res.trace.assumptions.push("Area already multiplied by coats per surface (coats column = 1)");
    traces.push(res.trace);
    const containerSize = containerFromUnit(m.unit);
    const net = containerSize ? res.netLitres / containerSize : res.netLitres;
    const gross = containerSize ? res.grossLitres / containerSize : res.grossLitres;
    const purchase = res.containers ?? res.purchaseLitres;
    boq.push(line(m, round(net, 2), m.wasteFactorPct, round(gross, 2), purchase, `Litres = area × coats ÷ ${m.coverageM2PerL} m²/L`, list.some((p) => p.estimated) ? "ESTIMATED" : "CALCULATED", list, traces.length - 1));
  }

  // ── accessories: explicit quantities only ──
  for (const [mId, list] of accessoriesByMat) {
    const m = mat.get(mId);
    if (!m) continue;
    const net = list.reduce((s, a) => s + a.qty, 0);
    const gross = net * (1 + m.wasteFactorPct / 100);
    const t = trace({ engine: "production.accessories", title: `Accessories — ${m.code}`, formula: "Σ specified quantity × (1 + waste%)", inputs: { list }, outputs: { net, gross }, assumptions: ["Quantities as specified on drawings/specifications"], units: m.unit, state: "CALCULATED" });
    traces.push(t);
    boq.push(line(m, net, m.wasteFactorPct, round(gross, 2), ceilSafe(gross), "Specified quantity + allowance", "CALCULATED", list, traces.length - 1));
  }

  return { boq: boq.sort((a, b) => a.category.localeCompare(b.category) || a.code.localeCompare(b.code)), cutting: cuttingOut, timber: timberOut, items: metrics, workloads, traces, issues };
}

function containerFromUnit(unit: string): number | undefined {
  const m = /(\d+(?:\.\d+)?)\s*l/i.exec(unit);
  return m ? Number(m[1]) : undefined;
}

function line(m: MaterialSnap, net: number, wastePct: number, gross: number, purchase: number, method: string, state: DataState, refs: { itemId: string; itemCode: string }[], traceIndex: number): BoqLine {
  const codes = [...new Set(refs.map((r) => r.itemCode))].sort();
  return {
    materialId: m.id, code: m.code, name: m.name, category: m.category, unit: m.unit,
    netQuantity: round(net, 3), wastePct, grossQuantity: round(gross, 3), purchaseQuantity: purchase,
    unitCost: m.unitCost, currency: m.currency, cost: m.unitCost == null ? null : round(m.unitCost * purchase, 2),
    state: m.status === "PENDING" ? "UNDER_REVIEW" : state, method, itemCodes: codes, itemIds: [...new Set(refs.map((r) => r.itemId))],
    traceIndex, leadTimeDays: m.supplierLeadTimeDays, supplierName: m.supplierName, materialStatus: m.status,
  };
}
