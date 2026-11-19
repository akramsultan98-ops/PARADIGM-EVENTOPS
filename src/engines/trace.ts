/**
 * Calculation provenance primitives (spec §17 B/C).
 * Every engine returns its numbers together with a CalcTrace so the UI, exports
 * and CalculationRecord rows can show formula, inputs, units, assumptions and state.
 */
import { createHash } from "node:crypto";

export const ENGINE_VERSION = "1.0.0";

export type DataState =
  | "VERIFIED"
  | "CALCULATED"
  | "ESTIMATED"
  | "NEEDS_INFORMATION"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED";

export interface CalcTrace {
  engine: string;
  title: string;
  formula: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  assumptions: string[];
  units?: string;
  state: DataState;
  subjectType?: string;
  subjectId?: string;
  engineVersion: string;
  inputHash: string;
}

export interface Issue {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  department?: string;
  subjectType?: string;
  subjectId?: string;
  /** a question to ask the responsible employee when information is missing */
  question?: string;
}

/** Deterministic JSON (sorted keys) so identical inputs always hash identically. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

export function hashInputs(inputs: unknown): string {
  return createHash("sha256").update(stableStringify(inputs)).digest("hex").slice(0, 16);
}

export function trace(t: Omit<CalcTrace, "engineVersion" | "inputHash">): CalcTrace {
  return { ...t, engineVersion: ENGINE_VERSION, inputHash: hashInputs({ e: t.engine, s: t.subjectId, i: t.inputs }) };
}

/** Round to a fixed number of decimals without floating noise (e.g. 0.1+0.2). */
export function round(n: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** Ceil that is robust to floating noise: ceilSafe(3.0000000001) === 3 */
export function ceilSafe(n: number): number {
  const r = Math.round(n);
  return Math.abs(n - r) < 1e-9 ? r : Math.ceil(n);
}
