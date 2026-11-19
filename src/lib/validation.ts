import { z } from "zod";

/**
 * Shared input validation (P2-E). Physical quantities must be positive and bounded; text that is not a number is
 * an error (it is never silently turned into "unknown"). Limits also bound the work the calculation engines do.
 */
export const LIMITS = {
  maxDimensionM: 100, // any single item / panel / surface dimension
  maxCargoDimensionM: 30,
  maxUnitWeightKg: 40000,
  maxPackedVolumeM3: 500,
  /** individual pieces a single production submission may expand to (spec quantity × item quantity) */
  maxPiecesPerSubmission: 20000,
  /** pieces the cutting optimiser expands per material before refusing (defence in depth for existing data) */
  maxCuttingPieces: 20000,
  /** individual cargo units the fleet packer expands */
  maxCargoUnits: 10000,
  maxUploadBytes: 20 * 1024 * 1024,
} as const;

const toNumberOrNull = (v: unknown, ctx: z.RefinementCtx): number | null => {
  if (v === "" || v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
  if (!Number.isFinite(n)) { ctx.addIssue({ code: "custom", message: `"${String(v)}" is not a valid number` }); return z.NEVER; }
  return n;
};
const optional = () => z.union([z.string(), z.number()]).optional().nullable();

/** Optional number > 0 and ≤ max (dimensions, weights, volumes). */
export const optPositive = (max: number, label = "Value") => optional().transform((v, ctx) => {
  const n = toNumberOrNull(v, ctx);
  if (n === null) return null;
  if (n <= 0) { ctx.addIssue({ code: "custom", message: `${label} must be greater than zero` }); return z.NEVER; }
  if (n > max) { ctx.addIssue({ code: "custom", message: `${label} must not exceed ${max}` }); return z.NEVER; }
  return n;
});
/** Optional number ≥ 0 and ≤ max (money, power). */
export const optNonNegative = (max: number, label = "Value") => optional().transform((v, ctx) => {
  const n = toNumberOrNull(v, ctx);
  if (n === null) return null;
  if (n < 0) { ctx.addIssue({ code: "custom", message: `${label} must not be negative` }); return z.NEVER; }
  if (n > max) { ctx.addIssue({ code: "custom", message: `${label} must not exceed ${max}` }); return z.NEVER; }
  return n;
});
/** Optional whole number within [min, max]. */
export const optInt = (min: number, max: number, label = "Value") => optional().transform((v, ctx) => {
  const n = toNumberOrNull(v, ctx);
  if (n === null) return null;
  if (!Number.isInteger(n) || n < min || n > max) { ctx.addIssue({ code: "custom", message: `${label} must be a whole number between ${min} and ${max}` }); return z.NEVER; }
  return n;
});
