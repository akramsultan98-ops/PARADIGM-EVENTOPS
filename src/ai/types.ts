import { z } from "zod/v4";

/** Structured draft extracted from free text / documents. Values are DRAFTS until a person confirms them. */
export const ProductionDraft = z.object({
  name: z.string().nullable(),
  category: z.enum(["STAGE", "BACKDROP", "PODIUM", "BOOTH", "COUNTER", "FURNITURE", "DECORATIVE", "SIGNAGE", "CARPENTRY", "PAINTING", "BRANDING_INSTALL", "FLOORING", "OTHER"]).nullable(),
  quantity: z.number().int().positive().nullable(),
  widthM: z.number().positive().nullable(),
  heightM: z.number().positive().nullable(),
  depthM: z.number().positive().nullable(),
  material: z.string().nullable(),
  thicknessMm: z.number().positive().nullable(),
  finishing: z.string().nullable(),
  color: z.string().nullable(),
  paintCoats: z.number().int().positive().nullable(),
  constructionMethod: z.string().nullable(),
  installationDay: z.number().int().positive().nullable(),
  notes: z.string().nullable(),
});
export type ProductionDraft = z.infer<typeof ProductionDraft>;

export const AvDraftLine = z.object({ description: z.string(), category: z.string().nullable(), quantity: z.number().int().positive().nullable(), backupQuantity: z.number().int().min(0).nullable(), modelHint: z.string().nullable() });
export type AvDraftLine = z.infer<typeof AvDraftLine>;

export const ExtractionSchema = z.object({
  department: z.enum(["PRODUCTION", "AV", "LOGISTICS", "ACCOMMODATION", "CREATIVE", "OTHER"]),
  production: z.array(ProductionDraft),
  av: z.array(AvDraftLine),
  /** sentences in the source that state each value (provenance) */
  evidence: z.array(z.object({ field: z.string(), snippet: z.string() })),
  assumptionsMade: z.array(z.string()),
});
export type Extraction = z.infer<typeof ExtractionSchema> & { engine: "RULE_BASED" | "AI"; model?: string };

export interface MissingField { field: string; label: string; question: string; itemIndex?: number }
