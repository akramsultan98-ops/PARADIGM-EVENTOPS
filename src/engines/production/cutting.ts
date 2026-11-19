/**
 * 2D board cutting optimisation — guillotine packing with best-area-fit.
 *
 * Deterministic: panels are sorted by (longest side desc, area desc, label asc),
 * so identical inputs always give the identical layout.
 *
 * Model:
 *  - usable board = (stockLength − 2·edgeTrim) × (stockWidth − 2·edgeTrim)
 *  - every panel consumes (w + kerf) × (h + kerf) — a conservative saw-kerf allowance
 *  - rotation by 90° is allowed unless the panel requires grain direction
 *  - offcuts are reused: all panels of one material share the free space of every opened board
 *  - panels larger than the usable board are NOT forced; they are reported as unplaced
 *    (a joint / split must be specified on the drawing).
 */
import { round, trace, type CalcTrace } from "../trace";

export interface PanelInput {
  label: string;
  /** metres */
  length: number;
  /** metres */
  width: number;
  quantity: number;
  /** if true the panel cannot be rotated (grain must run along board length) */
  grainLocked?: boolean;
}

export interface BoardSpec {
  materialCode: string;
  stockLengthM: number;
  stockWidthM: number;
  kerfMm: number;
  edgeTrimMm: number;
}

export interface Placement { label: string; x: number; y: number; w: number; h: number; rotated: boolean }
export interface BoardLayout { board: number; placements: Placement[]; usedAreaM2: number; freeRects: Rect[] }
interface Rect { x: number; y: number; w: number; h: number }

export interface CuttingResult {
  boardsUsed: number;
  layouts: BoardLayout[];
  unplaced: { label: string; length: number; width: number; reason: string }[];
  panelAreaM2: number;
  boardAreaM2: number;
  utilizationPct: number;
  reusableOffcuts: { board: number; w: number; h: number }[];
  trace: CalcTrace;
}

const EPS = 1e-9;
/** Upper bound on individual pieces expanded by the optimiser (P2-E). Mirrors LIMITS.maxCuttingPieces. */
export const MAX_CUTTING_PIECES = 20000;

function emptyResult(board: BoardSpec, panels: PanelInput[], unplaced: CuttingResult["unplaced"]): CuttingResult {
  return {
    boardsUsed: 0, layouts: [], unplaced, panelAreaM2: 0, boardAreaM2: 0, utilizationPct: 0, reusableOffcuts: [],
    trace: trace({ engine: "production.cutting", title: `Board cutting plan — ${board.materialCode}`, formula: "Not calculated — input exceeds safe workload or is invalid", inputs: { board, panels: panels.length }, outputs: { boardsUsed: 0, unplaced: unplaced.length }, assumptions: unplaced.map((u) => u.reason), units: "boards (sheets)", state: "NEEDS_INFORMATION" }),
  };
}

export function optimizeCutting(board: BoardSpec, panels: PanelInput[], opts: { minOffcutM?: number } = {}): CuttingResult {
  const trim = board.edgeTrimMm / 1000;
  const kerf = board.kerfMm / 1000;
  const usableL = board.stockLengthM - 2 * trim;
  const usableW = board.stockWidthM - 2 * trim;
  if (usableL <= 0 || usableW <= 0) throw new Error("Edge trim leaves no usable board area");

  const layouts: BoardLayout[] = [];
  const unplaced: CuttingResult["unplaced"] = [];

  // invalid pieces are reported, never silently dropped
  const valid = panels.filter((p) => {
    const ok = Number.isFinite(p.length) && Number.isFinite(p.width) && Number.isInteger(p.quantity) && p.length > 0 && p.width > 0 && p.quantity > 0;
    if (!ok) unplaced.push({ label: p.label, length: p.length, width: p.width, reason: `Invalid size or quantity (${p.length} × ${p.width} m × ${p.quantity}) — correct the component on the drawing` });
    return ok;
  });
  // bound the work before expanding quantities into individual pieces (protects the server from huge inputs)
  const totalPieces = valid.reduce((s, p) => s + p.quantity, 0);
  if (totalPieces > MAX_CUTTING_PIECES) {
    unplaced.push({ label: `${totalPieces} pieces`, length: 0, width: 0, reason: `Too many pieces to optimise (${totalPieces} > ${MAX_CUTTING_PIECES}) — split the item or verify the quantities` });
    return emptyResult(board, panels, unplaced);
  }
  const pieces: PanelInput[] = [];
  for (const p of valid) for (let i = 0; i < p.quantity; i++) pieces.push({ ...p, quantity: 1, label: p.quantity > 1 ? `${p.label} #${i + 1}` : p.label });
  pieces.sort((a, b) => {
    const la = Math.max(a.length, a.width), lb = Math.max(b.length, b.width);
    if (Math.abs(lb - la) > EPS) return lb - la;
    const aa = a.length * a.width, ab = b.length * b.width;
    if (Math.abs(ab - aa) > EPS) return ab - aa;
    return a.label.localeCompare(b.label);
  });

  const fits = (r: Rect, w: number, h: number) => w <= r.w + EPS && h <= r.h + EPS;

  for (const piece of pieces) {
    // orientation candidates: (along length, across width)
    const orient: { w: number; h: number; rotated: boolean }[] = [{ w: piece.length + kerf, h: piece.width + kerf, rotated: false }];
    if (!piece.grainLocked) orient.push({ w: piece.width + kerf, h: piece.length + kerf, rotated: true });

    const tooBig = orient.every((o) => o.w - kerf > usableL + EPS || o.h - kerf > usableW + EPS);
    if (tooBig) {
      unplaced.push({ label: piece.label, length: piece.length, width: piece.width, reason: `Panel exceeds usable board ${round(usableL, 3)}×${round(usableW, 3)} m — a joint/split must be specified on the drawing` });
      continue;
    }

    let best: { layout: BoardLayout; rectIdx: number; o: (typeof orient)[number]; score: number } | null = null;
    for (const layout of layouts) {
      layout.freeRects.forEach((r, idx) => {
        for (const o of orient) {
          if (!fits(r, o.w, o.h) && !fits(r, o.w - kerf, o.h - kerf)) continue;
          const score = r.w * r.h - o.w * o.h; // best-area-fit
          if (!best || score < best.score - EPS) best = { layout, rectIdx: idx, o, score };
        }
      });
      if (best) break; // first board (in order) that can host the piece, best rect within it
    }
    if (!best) {
      const layout: BoardLayout = { board: layouts.length + 1, placements: [], usedAreaM2: 0, freeRects: [{ x: 0, y: 0, w: usableL, h: usableW }] };
      layouts.push(layout);
      const o = orient.find((oo) => fits(layout.freeRects[0], oo.w, oo.h) || fits(layout.freeRects[0], oo.w - kerf, oo.h - kerf))!;
      best = { layout, rectIdx: 0, o, score: 0 };
    }
    const { layout, rectIdx, o } = best as NonNullable<typeof best>;
    const r = layout.freeRects[rectIdx];
    // a piece touching the far edge does not need a trailing kerf
    const pw = Math.min(o.w, r.w);
    const ph = Math.min(o.h, r.h);
    layout.placements.push({ label: piece.label, x: round(r.x + trim, 4), y: round(r.y + trim, 4), w: round(o.w - kerf, 4), h: round(o.h - kerf, 4), rotated: o.rotated });
    layout.usedAreaM2 += piece.length * piece.width;
    // guillotine split along the shorter leftover axis
    layout.freeRects.splice(rectIdx, 1);
    const rightW = r.w - pw, topH = r.h - ph;
    let right: Rect, top: Rect;
    if (rightW < topH) {
      right = { x: r.x + pw, y: r.y, w: rightW, h: ph };
      top = { x: r.x, y: r.y + ph, w: r.w, h: topH };
    } else {
      right = { x: r.x + pw, y: r.y, w: rightW, h: r.h };
      top = { x: r.x, y: r.y + ph, w: pw, h: topH };
    }
    for (const fr of [right, top]) if (fr.w > EPS && fr.h > EPS) layout.freeRects.push(fr);
  }

  const panelAreaM2 = layouts.reduce((s, l) => s + l.usedAreaM2, 0);
  const boardAreaM2 = layouts.length * board.stockLengthM * board.stockWidthM;
  const minOff = opts.minOffcutM ?? 0.3;
  const reusableOffcuts = layouts.flatMap((l) => l.freeRects.filter((f) => f.w >= minOff && f.h >= minOff).map((f) => ({ board: l.board, w: round(f.w, 3), h: round(f.h, 3) })));
  const utilizationPct = boardAreaM2 > 0 ? round((panelAreaM2 / boardAreaM2) * 100, 1) : 0;

  return {
    boardsUsed: layouts.length,
    layouts: layouts.map((l) => ({ ...l, usedAreaM2: round(l.usedAreaM2, 4), freeRects: l.freeRects.map((f) => ({ x: round(f.x, 4), y: round(f.y, 4), w: round(f.w, 4), h: round(f.h, 4) })) })),
    unplaced,
    panelAreaM2: round(panelAreaM2, 3),
    boardAreaM2: round(boardAreaM2, 3),
    utilizationPct,
    reusableOffcuts,
    trace: trace({
      engine: "production.cutting",
      title: `Board cutting plan — ${board.materialCode}`,
      formula: "Guillotine best-area-fit packing; piece footprint = (L + kerf) × (W + kerf); usable board = (Ls − 2·trim) × (Ws − 2·trim)",
      inputs: { board, pieces: pieces.length, panels },
      outputs: { boardsUsed: layouts.length, utilizationPct, unplaced: unplaced.length },
      assumptions: [
        `Saw kerf ${board.kerfMm} mm and edge trim ${board.edgeTrimMm} mm per side`,
        "Rotation allowed except for grain-locked panels",
        "Offcuts are shared between all panels of this material in the project",
      ],
      units: "boards (sheets)",
      state: unplaced.length > 0 ? "NEEDS_INFORMATION" : "CALCULATED",
    }),
  };
}

/**
 * Surface-area estimate — ONLY used when no panel breakdown from an approved drawing exists.
 * It is always labelled ESTIMATED and must never be presented as a cutting calculation.
 */
export function estimateBoardsByArea(board: BoardSpec, surfaceAreaM2: number, wastePct: number) {
  const boardArea = board.stockLengthM * board.stockWidthM;
  const raw = (surfaceAreaM2 * (1 + wastePct / 100)) / boardArea;
  const boards = Math.ceil(raw - 1e-9);
  return {
    boards,
    trace: trace({
      engine: "production.board-estimate",
      title: `Board estimate by surface area — ${board.materialCode}`,
      formula: "Boards ≈ CEILING(Surface area × (1 + waste%) ÷ board area)",
      inputs: { surfaceAreaM2, wastePct, boardAreaM2: boardArea },
      outputs: { boards },
      assumptions: ["No approved panel breakdown — preliminary estimate only, not a cutting plan", `Waste allowance ${wastePct}%`],
      units: "boards",
      state: "ESTIMATED",
    }),
  };
}
