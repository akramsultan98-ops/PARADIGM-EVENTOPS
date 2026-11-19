import * as D from "@/demo/aswan";
import { DEFAULT_STANDARDS, type ProjectSnapshot } from "@/engines/snapshot";

const d = (s: string) => new Date(s);
const day = (s: string) => new Date(`${s}T12:00:00Z`);

export function aswanSnapshot(): ProjectSnapshot {
  const vendors = new Map(D.DEMO_VENDORS.map((v) => [v.key, v]));
  return {
    asOf: d(D.ASWAN_DATES.asOf),
    project: {
      id: "P1", code: "DEMO-ASW-2612", name: "Aswan Corporate Conference", currency: "EGP", participants: 150,
      eventStart: d(D.ASWAN_DATES.eventStart), eventEnd: d(D.ASWAN_DATES.eventEnd), setupStart: d(D.ASWAN_DATES.setupStart), setupEnd: d(D.ASWAN_DATES.setupEnd),
      dismantleStart: d(D.ASWAN_DATES.dismantleStart), dismantleEnd: d(D.ASWAN_DATES.dismantleEnd), budgetAmount: 1500000, location: "Aswan", originCity: "Cairo",
    },
    venue: { name: D.DEMO_VENUE.name, city: D.DEMO_VENUE.city, accessOpens: D.DEMO_VENUE.accessOpens, accessCloses: D.DEMO_VENUE.accessCloses, powerCapacityKw: D.DEMO_VENUE.powerCapacityKw },
    standards: structuredClone(DEFAULT_STANDARDS),
    materials: D.DEMO_MATERIALS.map((m) => ({
      id: m.code, code: m.code, name: m.name, category: m.category, unit: m.unit,
      stockLengthM: "stockLengthM" in m ? m.stockLengthM : null, stockWidthM: "stockWidthM" in m ? m.stockWidthM : null, thicknessMm: "thicknessMm" in m ? m.thicknessMm : null,
      weightPerUnitKg: "weightPerUnitKg" in m ? m.weightPerUnitKg : null, coverageM2PerL: "coverageM2PerL" in m ? m.coverageM2PerL : null, wasteFactorPct: m.wasteFactorPct,
      kerfMm: "kerfMm" in m ? m.kerfMm : null, edgeTrimMm: "edgeTrimMm" in m ? m.edgeTrimMm : null, grainDirection: "grainDirection" in m ? m.grainDirection : false,
      unitCost: m.unitCost, currency: "EGP", status: "DEMO", supplierName: vendors.get(m.supplier)!.name, supplierLeadTimeDays: vendors.get(m.supplier)!.leadTimeDays, stockQty: m.stockQty,
    })),
    productionItems: D.DEMO_PRODUCTION_ITEMS.map((it) => ({
      id: it.code, code: it.code, name: it.name, category: it.category, quantity: it.quantity, widthM: it.widthM, heightM: it.heightM, depthM: it.depthM,
      boardMaterialId: it.board, finishing: it.finishing, paintCoats: it.paintCoats, drawingStatus: it.drawingStatus, installationDay: it.installationDay,
      packedVolumeM3: it.packedVolumeM3, packedWeightKg: null, engineeringApprovalRequired: it.engineeringApprovalRequired,
      specs: it.specs.map((s, i) => ({ id: `${it.code}-${i}`, kind: s.kind, label: s.label, materialId: s.material, lengthM: s.lengthM ?? null, widthM: s.widthM ?? null, quantity: s.quantity, sides: s.sides ?? 1, coats: s.coats ?? null })),
    })),
    laborCategories: D.DEMO_LABOR.map((l) => ({ id: l.key, key: l.key, name: l.name, dailyHours: l.dailyHours, breakHours: l.breakHours, maxOvertimeHours: l.maxOvertimeHours, dailyRate: l.dailyRate, overtimeHourlyRate: l.overtimeHourlyRate, currency: "EGP", headcount: l.headcount, status: "DEMO", rates: l.rates.map(([a, u, h]) => ({ activity: a, unitOfWork: u, hoursPerUnit: h, status: "DEMO" })) })),
    equipment: D.DEMO_EQUIPMENT.map((e) => ({
      id: e.code, code: e.code, category: e.category, model: e.model, weightKg: e.weightKg, caseVolumeM3: e.caseVolumeM3, powerW: e.powerW, setupMinutes: e.setupMinutes, techniciansRequired: e.techniciansRequired,
      rentalDailyRate: e.rentalDailyRate, currency: "EGP", ownership: "OWNED" as const, ownedQty: e.owned, outOfService: e.outOfService,
      allocatedElsewhere: e.code === D.DEMO_OTHER_PROJECT_ALLOCATION.equipment ? [{ projectCode: D.DEMO_OTHER_PROJECT_ALLOCATION.projectCode, start: d(D.DEMO_OTHER_PROJECT_ALLOCATION.start), end: d(D.DEMO_OTHER_PROJECT_ALLOCATION.end), quantity: D.DEMO_OTHER_PROJECT_ALLOCATION.quantity }] : [],
    })),
    equipmentRequirements: D.DEMO_EQUIPMENT_REQUIREMENTS.map((r, i) => ({ id: `REQ-${String(i).padStart(4, "0")}`, category: r.category, description: r.description, equipmentId: r.equipment, quantity: r.quantity, backupQuantity: r.backup })),
    vehicles: D.DEMO_VEHICLES.map((v) => ({ id: v.code, code: v.code, type: v.type, payloadKg: v.payloadKg, volumeM3: v.volumeM3, internalLengthM: v.L, internalWidthM: v.W, internalHeightM: v.H, dailyCost: v.dailyCost, currency: "EGP", available: v.available, maintenanceStatus: v.maintenanceStatus, bookedElsewhere: [] })),
    driversAvailable: 4,
    extraCargo: D.DEMO_EXTRA_CARGO.map((c, i) => ({ id: `CARGO-${i}`, sourceType: c.sourceType, name: c.name, quantity: c.quantity, lengthM: c.L, widthM: c.W, heightM: c.H, unitWeightKg: c.weight, unitVolumeM3: null, fragile: c.fragile })),
    routes: [{ ...D.DEMO_ROUTE }],
    accommodation: D.DEMO_ROOMING.map((r, i) => ({ id: `ACC-${i}`, guestName: r.guest, personKey: r.guest, department: r.dept, jobRole: r.role, hotelId: r.hotel, roomTypeId: `${r.hotel}-${r.room}`, roomLabel: r.label, sharedRoom: !!r.label, checkIn: day(r.in), checkOut: day(r.out), bookingStatus: r.status, confirmationRef: r.status === "CONFIRMED" ? `CNF-${i}` : null })),
    hotels: D.DEMO_HOTELS.map((h) => ({ id: h.key, name: h.name, roomTypes: h.roomTypes.map((t) => ({ id: `${h.key}-${t.name}`, name: t.name, capacity: t.capacity, nightlyRate: t.nightlyRate, currency: "EGP", roomsAvailable: t.roomsAvailable })) })),
    branding: D.DEMO_BRANDING.map((b, i) => ({ id: `BRAND-${i}`, name: b.name, widthM: b.widthM, heightM: b.heightM, quantity: b.quantity, material: b.material, printMethod: b.printMethod, leadTimeDays: b.leadTimeDays, vendorName: "Demo Print House", unitCost: b.unitCost, currency: "EGP", clientApprovalDeadline: day(b.clientApprovalDeadline), deliveryDeadline: day(b.deliveryDeadline), approvalStatus: b.approval })),
    manualCosts: D.DEMO_MANUAL_COSTS.map((c, i) => ({ id: `MC-${i}`, ...c })),
    exchangeRates: [{ ...D.DEMO_FX, rateDate: day(D.DEMO_FX.rateDate) }],
  };
}
