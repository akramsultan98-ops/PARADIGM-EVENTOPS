/** Unit normalisation and validation (spec §17D: unit & range validation). */

const LENGTH_TO_M: Record<string, number> = {
  mm: 0.001, millimeter: 0.001, millimetre: 0.001,
  cm: 0.01, centimeter: 0.01, centimetre: 0.01,
  m: 1, meter: 1, metre: 1, meters: 1, metres: 1,
  in: 0.0254, inch: 0.0254, inches: 0.0254,
  ft: 0.3048, foot: 0.3048, feet: 0.3048,
};

export function toMeters(value: number, unit: string): number {
  const f = LENGTH_TO_M[unit.trim().toLowerCase()];
  if (f === undefined) throw new Error(`Unknown length unit "${unit}"`);
  return value * f;
}

export function isLengthUnit(unit: string): boolean {
  return unit.trim().toLowerCase() in LENGTH_TO_M;
}

export interface RangeRule { min?: number; max?: number; label: string; unit: string }

/** Plausibility ranges for event production (flags, never blocks). */
export const RANGES = {
  productionDimensionM: { min: 0.05, max: 60, label: "Production dimension", unit: "m" },
  paintCoats: { min: 1, max: 6, label: "Paint coats", unit: "coats" },
  participants: { min: 1, max: 100000, label: "Participants", unit: "people" },
  vehiclePayloadKg: { min: 100, max: 40000, label: "Vehicle payload", unit: "kg" },
} satisfies Record<string, RangeRule>;

export function checkRange(value: number | null | undefined, rule: RangeRule): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  if (rule.min !== undefined && value < rule.min) return `${rule.label} ${value} ${rule.unit} is below the plausible minimum ${rule.min} ${rule.unit}`;
  if (rule.max !== undefined && value > rule.max) return `${rule.label} ${value} ${rule.unit} exceeds the plausible maximum ${rule.max} ${rule.unit}`;
  return null;
}
