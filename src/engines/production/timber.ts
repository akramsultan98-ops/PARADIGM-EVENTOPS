/**
 * 1D cutting stock for timber battens / metal profiles — First-Fit-Decreasing.
 * Members come ONLY from drawing-derived FRAME_MEMBER specifications. Structural adequacy is
 * out of scope: framing must be approved by a qualified engineer (flag carried in the trace).
 */
import { round, trace, type CalcTrace } from "../trace";

export interface MemberInput { label: string; lengthM: number; quantity: number }
export interface StockSpec { materialCode: string; stockLengthM: number; kerfMm: number }

export interface TimberResult {
  sticks: { stick: number; cuts: { label: string; lengthM: number }[]; offcutM: number }[];
  sticksUsed: number;
  netLengthM: number;
  stockLengthTotalM: number;
  yieldPct: number;
  oversize: MemberInput[];
  trace: CalcTrace;
}

/** Upper bound on expanded timber pieces (P2-E). */
export const MAX_TIMBER_PIECES = 20000;

export function optimizeTimber(stock: StockSpec, members: MemberInput[]): TimberResult {
  const kerf = stock.kerfMm / 1000;
  const pieces: { label: string; lengthM: number }[] = [];
  const oversize: MemberInput[] = [];
  // invalid members and workloads beyond the safe bound are reported (as not cuttable), never expanded (P2-E)
  const total = members.reduce((s, m) => s + (Number.isInteger(m.quantity) && m.quantity > 0 ? m.quantity : 0), 0);
  for (const m of members) {
    const invalid = !(Number.isFinite(m.lengthM) && m.lengthM > 0 && Number.isInteger(m.quantity) && m.quantity > 0);
    if (invalid || total > MAX_TIMBER_PIECES || m.lengthM > stock.stockLengthM + 1e-9) { oversize.push(m); continue; }
    for (let i = 0; i < m.quantity; i++) pieces.push({ label: m.label, lengthM: m.lengthM });
  }
  pieces.sort((a, b) => b.lengthM - a.lengthM || a.label.localeCompare(b.label));
  const sticks: { stick: number; cuts: { label: string; lengthM: number }[]; remaining: number }[] = [];
  for (const p of pieces) {
    let target = sticks.find((s) => s.remaining + 1e-9 >= p.lengthM + (s.cuts.length ? kerf : 0));
    if (!target) { target = { stick: sticks.length + 1, cuts: [], remaining: stock.stockLengthM }; sticks.push(target); }
    target.remaining -= p.lengthM + (target.cuts.length ? kerf : 0);
    target.cuts.push(p);
  }
  const netLengthM = pieces.reduce((s, p) => s + p.lengthM, 0);
  const stockLengthTotalM = sticks.length * stock.stockLengthM;
  const yieldPct = stockLengthTotalM ? round((netLengthM / stockLengthTotalM) * 100, 1) : 0;
  return {
    sticks: sticks.map((s) => ({ stick: s.stick, cuts: s.cuts, offcutM: round(s.remaining, 3) })),
    sticksUsed: sticks.length,
    netLengthM: round(netLengthM, 3),
    stockLengthTotalM: round(stockLengthTotalM, 3),
    yieldPct,
    oversize,
    trace: trace({
      engine: "production.timber",
      title: `Timber cutting — ${stock.materialCode}`,
      formula: "First-Fit-Decreasing 1D cutting stock; each additional cut on a stick consumes one kerf",
      inputs: { stock, members },
      outputs: { sticksUsed: sticks.length, netLengthM: round(netLengthM, 3), yieldPct },
      assumptions: [
        "Members taken from drawing-derived frame specifications only",
        "Structural adequacy / load bearing must be approved by a qualified engineer",
        `Stock length ${stock.stockLengthM} m, kerf ${stock.kerfMm} mm`,
      ],
      units: "sticks",
      state: oversize.length ? "NEEDS_INFORMATION" : "CALCULATED",
    }),
  };
}
