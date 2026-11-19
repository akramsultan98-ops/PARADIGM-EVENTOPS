/**
 * Transportation & fleet engine (spec §11).
 * Cargo is packed into available vehicles respecting BOTH payload (kg) and volume (m³),
 * each derated by the company fill factor, plus internal-dimension checks.
 * Travel durations come only from stored route estimates — never fabricated.
 */
import { round, trace, type CalcTrace, type DataState, type Issue } from "./trace";
import type { RouteSnap, VehicleSnap } from "./snapshot";

export interface CargoLine {
  key: string;
  sourceType: string;
  name: string;
  quantity: number;
  unitWeightKg: number | null;
  unitVolumeM3: number | null;
  maxDimM: number | null;
  fragile: boolean;
}

export interface Trip {
  vehicleId: string;
  vehicleCode: string;
  vehicleType: string;
  items: { key: string; name: string; units: number; weightKg: number; volumeM3: number; fragile: boolean }[];
  weightKg: number;
  volumeM3: number;
  weightUtilPct: number;
  volumeUtilPct: number;
  dailyCost: number | null;
  currency: string;
}

export interface LogisticsResult {
  trips: Trip[];
  backupVehicle: { id: string; code: string; type: string } | null;
  unassigned: { key: string; name: string; reason: string }[];
  totals: { weightKg: number; volumeM3: number; units: number };
  route: RouteSnap | null;
  routeState: DataState;
  traces: CalcTrace[];
  issues: Issue[];
}

const overlaps = (a0: Date, a1: Date, b0: Date, b1: Date) => a0 < b1 && b0 < a1;

export function planTransport(
  cargo: CargoLine[],
  vehicles: VehicleSnap[],
  opts: { fillFactor: number; window: { start: Date; end: Date }; origin: string; destination: string; routes: RouteSnap[]; driversAvailable: number },
): LogisticsResult {
  const issues: Issue[] = [];
  const traces: CalcTrace[] = [];
  const unassigned: LogisticsResult["unassigned"] = [];

  const usable = vehicles.filter((v) => {
    if (!v.available || v.maintenanceStatus !== "OK") return false;
    const clash = v.bookedElsewhere.find((b) => overlaps(b.start, b.end, opts.window.start, opts.window.end));
    if (clash) { issues.push({ severity: "info", code: "VEHICLE_BOOKED", department: "LOGISTICS", message: `${v.code} is booked on ${clash.projectCode} during this window` }); return false; }
    return true;
  });
  vehicles.filter((v) => !v.available || v.maintenanceStatus !== "OK").forEach((v) => issues.push({ severity: "info", code: "VEHICLE_UNAVAILABLE", department: "LOGISTICS", message: `${v.code} (${v.type}) unavailable: ${v.available ? v.maintenanceStatus : "marked unavailable"}` }));

  // expand to packable units
  type Unit = { key: string; name: string; w: number; v: number; dim: number | null; fragile: boolean };
  const units: Unit[] = [];
  for (const c of cargo) {
    if (c.unitWeightKg == null || c.unitVolumeM3 == null) {
      unassigned.push({ key: c.key, name: c.name, reason: "Weight or volume unknown — cannot be allocated to a vehicle" });
      continue;
    }
    for (let i = 0; i < c.quantity; i++) units.push({ key: c.key, name: c.name, w: c.unitWeightKg, v: c.unitVolumeM3, dim: c.maxDimM, fragile: c.fragile });
  }
  units.sort((a, b) => b.v - a.v || b.w - a.w || a.key.localeCompare(b.key));

  const maxLen = (v: VehicleSnap) => (v.internalLengthM == null ? Infinity : Math.max(v.internalLengthM, v.internalWidthM ?? 0, v.internalHeightM ?? 0));
  const cap = (v: VehicleSnap) => ({ w: v.payloadKg * opts.fillFactor, v: v.volumeM3 * opts.fillFactor });
  const fleet = [...usable].sort((a, b) => b.volumeM3 - a.volumeM3 || b.payloadKg - a.payloadKg || a.code.localeCompare(b.code));

  type Bin = { vehicle: VehicleSnap; w: number; v: number; units: Unit[] };
  const bins: Bin[] = [];
  const unused = [...fleet];
  for (const u of units) {
    let bin = bins.find((b) => b.w + u.w <= cap(b.vehicle).w + 1e-9 && b.v + u.v <= cap(b.vehicle).v + 1e-9 && (u.dim == null || u.dim <= maxLen(b.vehicle)));
    if (!bin) {
      const idx = unused.findIndex((v) => u.w <= cap(v).w && u.v <= cap(v).v && (u.dim == null || u.dim <= maxLen(v)));
      if (idx === -1) {
        const reason = fleet.some((v) => u.dim != null && u.dim <= maxLen(v)) || u.dim == null ? "Insufficient available fleet capacity" : `Longest dimension ${u.dim} m does not fit any available vehicle`;
        unassigned.push({ key: u.key, name: u.name, reason });
        continue;
      }
      bin = { vehicle: unused.splice(idx, 1)[0], w: 0, v: 0, units: [] };
      bins.push(bin);
    }
    bin.w += u.w; bin.v += u.v; bin.units.push(u);
  }
  // right-size: move each load to the smallest unused vehicle that can still carry it
  for (const b of bins) {
    const longest = Math.max(0, ...b.units.map((u) => u.dim ?? 0));
    const candidates = unused.filter((v) => b.w <= cap(v).w + 1e-9 && b.v <= cap(v).v + 1e-9 && longest <= maxLen(v)).sort((x, y) => x.volumeM3 - y.volumeM3 || x.payloadKg - y.payloadKg);
    const smaller = candidates[0];
    if (smaller && smaller.volumeM3 < b.vehicle.volumeM3) {
      unused.splice(unused.indexOf(smaller), 1);
      unused.push(b.vehicle);
      b.vehicle = smaller;
    }
  }

  const trips: Trip[] = bins.map((b) => {
    const grouped = new Map<string, Trip["items"][number]>();
    for (const u of b.units) {
      const g = grouped.get(u.key) ?? { key: u.key, name: u.name, units: 0, weightKg: 0, volumeM3: 0, fragile: u.fragile };
      g.units += 1; g.weightKg = round(g.weightKg + u.w, 2); g.volumeM3 = round(g.volumeM3 + u.v, 3);
      grouped.set(u.key, g);
    }
    return {
      vehicleId: b.vehicle.id, vehicleCode: b.vehicle.code, vehicleType: b.vehicle.type, items: [...grouped.values()],
      weightKg: round(b.w, 1), volumeM3: round(b.v, 3),
      weightUtilPct: round((b.w / b.vehicle.payloadKg) * 100, 1), volumeUtilPct: round((b.v / b.vehicle.volumeM3) * 100, 1),
      dailyCost: b.vehicle.dailyCost, currency: b.vehicle.currency,
    };
  });
  for (const u of unassigned) issues.push({ severity: "error", code: "CARGO_UNASSIGNED", department: "LOGISTICS", message: `${u.name}: ${u.reason}` });

  // backup: smallest remaining vehicle able to take over the heaviest single load
  const worst = bins.reduce<Bin | null>((m, b) => (!m || b.v > m.v ? b : m), null);
  const backup = worst ? unused.filter((v) => worst.w <= cap(v).w && worst.v <= cap(v).v).sort((x, y) => x.volumeM3 - y.volumeM3)[0] ?? null : null;
  if (bins.length && !backup) issues.push({ severity: "warning", code: "NO_BACKUP_VEHICLE", department: "LOGISTICS", message: "No available backup vehicle can replace the largest loaded vehicle — arrange a standby rental" });
  if (trips.length > opts.driversAvailable) issues.push({ severity: "error", code: "DRIVER_SHORTAGE", department: "LOGISTICS", message: `${trips.length} vehicles planned but only ${opts.driversAvailable} drivers available` });

  const route = opts.routes.find((r) => r.origin.toLowerCase() === opts.origin.toLowerCase() && r.destination.toLowerCase() === opts.destination.toLowerCase()) ?? null;
  let routeState: DataState = "VERIFIED";
  if (!route || route.durationHours == null) {
    routeState = "NEEDS_INFORMATION";
    issues.push({ severity: "error", code: "ROUTE_DURATION_MISSING", department: "LOGISTICS", message: `No route estimate ${opts.origin} → ${opts.destination}; travel time cannot be scheduled`, question: `What is the approved driving duration (hours) and distance from ${opts.origin} to ${opts.destination} for loaded trucks?` });
  } else if (!route.approved) {
    routeState = "ESTIMATED";
    issues.push({ severity: "warning", code: "ROUTE_NOT_APPROVED", department: "LOGISTICS", message: `Route ${route.origin} → ${route.destination} (${route.durationHours} h) is not an approved estimate (${route.source})` });
  }

  const totals = { weightKg: round(units.reduce((s, u) => s + u.w, 0), 1), volumeM3: round(units.reduce((s, u) => s + u.v, 0), 3), units: units.length };
  traces.push(trace({
    engine: "logistics.packing", title: "Fleet allocation (weight + volume)",
    formula: "First-Fit-Decreasing by volume; each vehicle limited to payload × fill and volume × fill; loads then right-sized to the smallest suitable vehicle",
    inputs: { cargo, fleet: usable.map((v) => ({ code: v.code, payloadKg: v.payloadKg, volumeM3: v.volumeM3 })), fillFactor: opts.fillFactor },
    outputs: { vehicles: trips.map((t) => `${t.vehicleCode}: ${t.weightKg} kg / ${t.volumeM3} m³`), unassigned: unassigned.length, backup: backup?.code ?? null },
    assumptions: [`Fill factor ${opts.fillFactor * 100}% applied to payload and volume`, "Volumes are packed (transport) volumes", "Loads are not stacked on fragile items — verify on the loading plan"],
    units: "vehicles", state: unassigned.length ? "NEEDS_INFORMATION" : "CALCULATED",
  }));
  return { trips, backupVehicle: backup ? { id: backup.id, code: backup.code, type: backup.type } : null, unassigned, totals, route, routeState, traces, issues };
}
