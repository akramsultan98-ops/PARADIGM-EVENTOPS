/**
 * Paint & primer consumption (spec §8.1):
 *   Litres = Paintable Area × Coats ÷ Coverage(m²/L), then × (1 + waste%), rounded up to container size.
 */
import { ceilSafe, round, trace, type CalcTrace } from "../trace";

export interface PaintInput {
  materialCode: string;
  areaM2: number;
  coats: number;
  coverageM2PerL: number;
  wastePct: number;
  containerL?: number;
}

export interface PaintResult { netLitres: number; grossLitres: number; containers: number | null; purchaseLitres: number; trace: CalcTrace }

export function calculatePaint(i: PaintInput): PaintResult {
  if (i.coverageM2PerL <= 0) throw new Error("Coverage must be positive");
  if (i.coats <= 0) throw new Error("Coats must be at least 1");
  const net = (i.areaM2 * i.coats) / i.coverageM2PerL;
  const gross = net * (1 + i.wastePct / 100);
  const containers = i.containerL ? ceilSafe(gross / i.containerL) : null;
  const purchase = containers && i.containerL ? containers * i.containerL : ceilSafe(gross);
  return {
    netLitres: round(net, 2),
    grossLitres: round(gross, 2),
    containers,
    purchaseLitres: round(purchase, 2),
    trace: trace({
      engine: "production.paint",
      title: `Paint consumption — ${i.materialCode}`,
      formula: "Litres = Area × Coats ÷ Coverage × (1 + Waste%)",
      inputs: { ...i },
      outputs: { netLitres: round(net, 2), grossLitres: round(gross, 2), containers, purchaseLitres: round(purchase, 2) },
      assumptions: [`Manufacturer coverage ${i.coverageM2PerL} m²/L`, `${i.coats} coat(s)`, `Waste allowance ${i.wastePct}%`],
      units: "litres",
      state: "CALCULATED",
    }),
  };
}
