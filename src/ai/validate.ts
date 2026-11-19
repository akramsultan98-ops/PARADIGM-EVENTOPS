/** Deterministic completeness validation applied to every extraction (AI or rule-based). */
import type { AvDraftLine, MissingField, ProductionDraft } from "./types";

export function missingProduction(d: ProductionDraft, i = 0): MissingField[] {
  const m: MissingField[] = [];
  const nm = d.name ?? "this item";
  if (!d.category) m.push({ field: "category", label: "Production category", question: `What type of item is "${nm}" (stage, backdrop, counter, …)?`, itemIndex: i });
  if (d.widthM == null) m.push({ field: "widthM", label: "Width", question: `What is the overall width of ${nm} in metres?`, itemIndex: i });
  if (d.heightM == null) m.push({ field: "heightM", label: "Height", question: `What is the overall height of ${nm} in metres?`, itemIndex: i });
  if (d.depthM == null) m.push({ field: "depthM", label: "Depth / packed volume", question: `What is the depth of ${nm}, or its packed transport volume?`, itemIndex: i });
  if (!d.material) m.push({ field: "material", label: "Material", question: `Which material is ${nm} made of?`, itemIndex: i });
  if (d.material && /mdf|ply/i.test(d.material) && d.thicknessMm == null) m.push({ field: "thicknessMm", label: "Board thickness", question: `Which ${d.material} thickness (mm) should be used?`, itemIndex: i });
  if (!d.finishing) m.push({ field: "finishing", label: "Finishing", question: `What finishing does ${nm} need (paint colour, vinyl, carpet…)?`, itemIndex: i });
  if (d.finishing && /paint|spray|lacquer/i.test(d.finishing) && d.paintCoats == null) m.push({ field: "paintCoats", label: "Paint coats", question: `How many coats of paint are required for ${nm}?`, itemIndex: i });
  if (d.installationDay == null) m.push({ field: "installationDay", label: "Installation day", question: `On which setup day should ${nm} be installed?`, itemIndex: i });
  m.push({ field: "drawing", label: "Technical drawing", question: `Please upload the technical drawing for ${nm} — panels and framing are only calculated from approved drawings.`, itemIndex: i });
  return m;
}

export function missingAv(l: AvDraftLine, i = 0): MissingField[] {
  const m: MissingField[] = [];
  if (l.quantity == null) m.push({ field: "quantity", label: "Quantity", question: `How many units for "${l.description}"?`, itemIndex: i });
  if (!l.category) m.push({ field: "category", label: "Equipment category", question: `Which equipment category is "${l.description}"?`, itemIndex: i });
  m.push({ field: "model", label: "Equipment model", question: `Which inventory model should be used for "${l.description}"?`, itemIndex: i });
  return m;
}
