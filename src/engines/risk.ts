/**
 * Risk & contingency engine (spec §20). Risks are generated from rules that inspect the
 * calculated plan. Generated risks are HYPOTHETICAL (status IDENTIFIED) — never incidents.
 * Severity = probability × impact, classified by configurable thresholds.
 */
import type { Standards } from "./snapshot";

export interface RiskOut {
  ruleKey: string;
  code: string;
  title: string;
  department: string;
  description: string;
  probability: number;
  impact: number;
  severity: number;
  level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  trigger: string;
  warningSigns: string;
  prevention: string;
  immediateAction: string;
  contingency: string;
  responseTimeMin: number | null;
  requiredResources: string;
  timeImpactHours: number | null;
  costImpact: number | null;
  costCurrency: string | null;
  ownerRole: string;
}

export function scoreRisk(probability: number, impact: number, t: Standards["riskThresholds"]) {
  if (probability < 1 || probability > 5 || impact < 1 || impact > 5) throw new Error("Probability and impact must be 1..5");
  const severity = probability * impact;
  const level: RiskOut["level"] = severity >= t.critical ? "CRITICAL" : severity >= t.high ? "HIGH" : severity >= t.medium ? "MEDIUM" : "LOW";
  return { severity, level };
}

export interface RiskFacts {
  origin: string;
  destination: string;
  routeHours: number | null;
  trips: { vehicleCode: string; vehicleType: string; dailyCost: number | null; currency: string }[];
  backupVehicle: { code: string; type: string } | null;
  avRentals: { description: string; rental: number }[];
  avBackups: number;
  avCategories: string[];
  avPowerKw: number;
  venuePowerKw: number | null;
  venueAccess: string | null;
  materialsShort: { code: string; leadTimeDays: number | null; slackDays: number | null }[];
  crewShortfalls: { name: string; shortfall: number }[];
  scheduleDeadlineConflicts: number;
  setupSlackHours: number | null;
  unconfirmedRooms: number;
  pendingClientApprovals: number;
}

type Rule = { key: string; when: (f: RiskFacts) => boolean; build: (f: RiskFacts) => Omit<RiskOut, "severity" | "level" | "code" | "ruleKey"> };

const RULES: Rule[] = [
  {
    key: "TRUCK_BREAKDOWN",
    when: (f) => f.trips.length > 0,
    build: (f) => ({
      title: "Transport vehicle breakdown en route", department: "LOGISTICS", ownerRole: "LOGISTICS_MANAGER",
      description: `${f.trips.length} vehicle(s) travel ${f.origin} → ${f.destination}${f.routeHours ? ` (~${f.routeHours} h)` : ""}. A breakdown delays all cargo on that vehicle.`,
      probability: 2, impact: f.backupVehicle ? 4 : 5,
      trigger: "Vehicle stops en route or fails pre-departure inspection",
      warningSigns: "Failed pre-trip inspection; missed driver check-in; GPS stationary > 30 min",
      prevention: "Pre-trip mechanical inspection; maintenance status verified; driver check-in schedule every 2 h",
      immediateAction: f.backupVehicle ? `Dispatch backup ${f.backupVehicle.type.toLowerCase().replace("_", " ")} ${f.backupVehicle.code} from ${f.origin} and transfer cargo` : "Arrange emergency rental truck near the breakdown location",
      contingency: "Re-sequence site tasks: start with cargo already delivered; extend site shift if required",
      responseTimeMin: 30, requiredResources: f.backupVehicle ? `Backup ${f.backupVehicle.code}, driver, 2 loaders` : "Emergency rental truck, driver, 2 loaders",
      timeImpactHours: f.routeHours, costImpact: f.trips[0]?.dailyCost ?? null, costCurrency: f.trips[0]?.currency ?? null,
    }),
  },
  {
    key: "RENTAL_DELIVERY_DELAY",
    when: (f) => f.avRentals.some((r) => r.rental > 0),
    build: (f) => ({
      title: "Rented AV equipment delivered late", department: "AV", ownerRole: "AV_MANAGER",
      description: `Rental required for: ${f.avRentals.filter((r) => r.rental > 0).map((r) => `${r.rental} × ${r.description}`).join("; ")}.`,
      probability: 3, impact: 4,
      trigger: "Supplier misses the agreed delivery window",
      warningSigns: "No dispatch confirmation 24 h before delivery; supplier unreachable",
      prevention: "Written delivery commitment with penalty clause; confirm dispatch 24 h ahead; identify a second supplier",
      immediateAction: "Escalate to supplier; activate alternate supplier quotation",
      contingency: "Install owned equipment first; re-sequence AV installation; reduce LED wall size only with client approval",
      responseTimeMin: 60, requiredResources: "Alternate supplier, AV technicians on standby",
      timeImpactHours: null, costImpact: null, costCurrency: null,
    }),
  },
  {
    key: "EQUIPMENT_FAILURE",
    when: (f) => f.avCategories.length > 0,
    build: (f) => ({
      title: "AV equipment failure during event", department: "AV", ownerRole: "AV_MANAGER",
      description: `AV system (${[...new Set(f.avCategories)].join(", ").toLowerCase().replace(/_/g, " ")}) with ${f.avBackups} backup unit(s) on site.`,
      probability: 2, impact: f.avBackups > 0 ? 3 : 5,
      trigger: "Device fails testing or during the programme",
      warningSigns: "Errors during technical testing; overheating; intermittent signal",
      prevention: "Full technical test and rehearsal; backup units powered-tested on site",
      immediateAction: "Swap to on-site backup unit",
      contingency: "Switch to backup signal path; reduce non-critical systems",
      responseTimeMin: 5, requiredResources: "Backup units, AV technician on standby",
      timeImpactHours: null, costImpact: null, costCurrency: null,
    }),
  },
  {
    key: "POWER_FAILURE",
    when: (f) => f.avPowerKw > 0,
    build: (f) => ({
      title: "Power failure or insufficient venue power", department: "AV", ownerRole: "AV_MANAGER",
      description: `AV load ${f.avPowerKw} kW; venue capacity ${f.venuePowerKw ?? "unknown"} kW.`,
      probability: f.venuePowerKw == null ? 3 : f.avPowerKw > f.venuePowerKw ? 5 : 2, impact: 5,
      trigger: "Venue power trips or is unavailable",
      warningSigns: "Breaker trips during testing; voltage drops",
      prevention: "Confirm venue power in writing; electrician-approved distribution; UPS for critical playback",
      immediateAction: "Switch critical systems to UPS; call venue electrician",
      contingency: "Standby generator sized to AV load",
      responseTimeMin: 5, requiredResources: "Generator (standby), electrician, UPS",
      timeImpactHours: null, costImpact: null, costCurrency: null,
    }),
  },
  {
    key: "MATERIAL_SHORTAGE",
    when: (f) => f.materialsShort.length > 0,
    build: (f) => ({
      title: "Material shortage or late material delivery", department: "PROCUREMENT", ownerRole: "PROCUREMENT_MANAGER",
      description: `Materials to purchase: ${f.materialsShort.map((m) => `${m.code}${m.leadTimeDays != null ? ` (lead ${m.leadTimeDays} d)` : " (lead time unknown)"}`).join(", ")}.`,
      probability: f.materialsShort.some((m) => m.slackDays != null && m.slackDays < 2) || f.materialsShort.some((m) => m.leadTimeDays == null) ? 4 : 2, impact: 4,
      trigger: "Supplier cannot deliver full quantity by the required date",
      warningSigns: "Unconfirmed purchase order; supplier stock not confirmed",
      prevention: "Issue purchase requests by the order-by dates; confirm stock in writing",
      immediateAction: "Source from alternate approved vendor",
      contingency: "Substitute equivalent material (requires Production Manager approval)",
      responseTimeMin: 240, requiredResources: "Alternate vendor list",
      timeImpactHours: null, costImpact: null, costCurrency: null,
    }),
  },
  {
    key: "CREW_SHORTAGE",
    when: (f) => f.crewShortfalls.length > 0,
    build: (f) => ({
      title: "Insufficient crew / crew absence", department: "PMO", ownerRole: "PROJECT_MANAGER",
      description: `Shortfalls: ${f.crewShortfalls.map((c) => `${c.name} −${c.shortfall}`).join(", ")}.`,
      probability: 4, impact: 4,
      trigger: "Required crew not confirmed 48 h before the phase",
      warningSigns: "Unconfirmed freelancers; overlapping projects",
      prevention: "Book freelance crew early; approve overtime plan",
      immediateAction: "Activate freelance pool / approved overtime",
      contingency: "Re-sequence tasks to free critical trades",
      responseTimeMin: 120, requiredResources: "Freelance crew, overtime budget",
      timeImpactHours: null, costImpact: null, costCurrency: null,
    }),
  },
  {
    key: "SETUP_OVERRUN",
    when: (f) => f.scheduleDeadlineConflicts > 0 || (f.setupSlackHours !== null && f.setupSlackHours < 4),
    build: (f) => ({
      title: "Setup not completed before event start", department: "PMO", ownerRole: "PROJECT_MANAGER",
      description: f.scheduleDeadlineConflicts > 0 ? `${f.scheduleDeadlineConflicts} task(s) are scheduled past their deadline.` : `Only ${f.setupSlackHours?.toFixed(1)} h slack between final inspection and event start.`,
      probability: f.scheduleDeadlineConflicts > 0 ? 5 : 3, impact: 5,
      trigger: "Critical-path task slips beyond its float",
      warningSigns: "Critical tasks behind plan at daily check",
      prevention: "Daily critical-path review; pre-assembly in workshop",
      immediateAction: "Add crew / overtime on critical-path tasks",
      contingency: "Descope non-critical decorative items with client approval",
      responseTimeMin: 60, requiredResources: "Extra crew, overtime approval",
      timeImpactHours: null, costImpact: null, costCurrency: null,
    }),
  },
  {
    key: "VENUE_ACCESS",
    when: (f) => f.venueAccess !== null,
    build: (f) => ({
      title: "Venue access restriction delays setup", department: "LOGISTICS", ownerRole: "PROJECT_MANAGER",
      description: `Venue access window: ${f.venueAccess}.`,
      probability: 2, impact: 4,
      trigger: "Venue denies or shortens access / loading slot",
      warningSigns: "Access letter not issued; security list not approved",
      prevention: "Obtain written access schedule and approved crew/vehicle list",
      immediateAction: "Escalate to venue operations manager",
      contingency: "Stage cargo at a nearby holding area; extend night shift if allowed",
      responseTimeMin: 30, requiredResources: "Venue liaison",
      timeImpactHours: null, costImpact: null, costCurrency: null,
    }),
  },
  {
    key: "HOTEL_BOOKING",
    when: (f) => f.unconfirmedRooms > 0,
    build: (f) => ({
      title: "Staff accommodation not confirmed", department: "ACCOMMODATION", ownerRole: "ACCOMMODATION_MANAGER",
      description: `${f.unconfirmedRooms} booking(s) not confirmed.`,
      probability: 3, impact: 3,
      trigger: "Hotel cannot confirm rooms 7 days before arrival",
      warningSigns: "No confirmation numbers; allotment release date passing",
      prevention: "Secure written confirmations; track allotment release dates",
      immediateAction: "Book alternate hotel from vendor list",
      contingency: "Split crew across two hotels; arrange transport",
      responseTimeMin: 240, requiredResources: "Alternate hotel",
      timeImpactHours: null, costImpact: null, costCurrency: null,
    }),
  },
  {
    key: "INTERNET_FAILURE",
    when: (f) => f.avCategories.some((c) => ["NETWORK", "MEDIA_SERVER", "RECORDING"].includes(c)),
    build: () => ({
      title: "Internet / network failure", department: "AV", ownerRole: "AV_MANAGER",
      description: "Streaming, presentations or registration depend on network connectivity.",
      probability: 2, impact: 3,
      trigger: "Venue internet drops or bandwidth insufficient",
      warningSigns: "Speed test below requirement during testing",
      prevention: "Dedicated line; 4G/5G bonded backup router",
      immediateAction: "Fail over to backup router",
      contingency: "Play all media from local storage",
      responseTimeMin: 5, requiredResources: "Backup router, local media copies",
      timeImpactHours: null, costImpact: null, costCurrency: null,
    }),
  },
  {
    key: "CLIENT_APPROVAL",
    when: (f) => f.pendingClientApprovals > 0,
    build: (f) => ({
      title: "Late client artwork approval", department: "CREATIVE", ownerRole: "CREATIVE_MANAGER",
      description: `${f.pendingClientApprovals} branding item(s) awaiting client approval.`,
      probability: 3, impact: 4,
      trigger: "Approval deadline passes without sign-off",
      warningSigns: "No feedback 48 h before approval deadline",
      prevention: "Approval reminders through Account Management",
      immediateAction: "Escalate to client via Account Manager",
      contingency: "Express printing at premium cost (requires Finance approval)",
      responseTimeMin: 240, requiredResources: "Express print vendor",
      timeImpactHours: null, costImpact: null, costCurrency: null,
    }),
  },
];

export function generateRisks(f: RiskFacts, standards: Standards): RiskOut[] {
  return RULES.filter((r) => r.when(f)).map((r, i) => {
    const b = r.build(f);
    const { severity, level } = scoreRisk(b.probability, b.impact, standards.riskThresholds);
    return { ...b, ruleKey: r.key, code: `R-${String(i + 1).padStart(2, "0")}`, severity, level };
  }).sort((a, b) => b.severity - a.severity || a.ruleKey.localeCompare(b.ruleKey)).map((r, i) => ({ ...r, code: `R-${String(i + 1).padStart(2, "0")}` }));
}
