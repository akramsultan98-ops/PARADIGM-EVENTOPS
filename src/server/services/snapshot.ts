import "server-only";
import { db, num } from "@/lib/db";
import { DEFAULT_STANDARDS, type ProjectSnapshot, type Standards } from "@/engines/snapshot";

/** Load the effective planning standards for a company (latest non-retired version per key). */
export async function loadStandards(companyId: string): Promise<{ standards: Standards; warehouseCity: string; rows: { key: string; status: string; version: number }[] }> {
  const rows = await db.companyStandard.findMany({ where: { companyId, status: { in: ["APPROVED", "DEMO"] } }, orderBy: { version: "desc" } });
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.key)) latest.set(r.key, r);
  const s: Standards = structuredClone(DEFAULT_STANDARDS);
  const planning = latest.get("PLANNING_STANDARDS")?.value as Partial<Standards> | undefined;
  if (planning) Object.assign(s, planning);
  const risk = latest.get("RISK_THRESHOLDS")?.value as Standards["riskThresholds"] | undefined;
  if (risk) s.riskThresholds = risk;
  const waste = latest.get("DEFAULT_WASTE_PCT")?.value;
  if (typeof waste === "number") s.defaultWastePct = waste;
  const cont = latest.get("CONTINGENCY_PCT")?.value;
  if (typeof cont === "number") s.contingencyPct = cont;
  const fill = latest.get("VEHICLE_FILL_FACTOR")?.value;
  if (typeof fill === "number") s.vehicleFillFactor = fill;
  const city = latest.get("WAREHOUSE_CITY")?.value;
  return { standards: s, warehouseCity: typeof city === "string" ? city : "Cairo", rows: [...latest.values()].map((r) => ({ key: r.key, status: r.status, version: r.version })) };
}

/** Per project per day the LARGEST single crew of a category (a lower bound of what is committed — never overstated). */
function committedByCategory(rows: { laborCategoryId: string; workDate: Date; crewSize: number; project: { code: string } }[], categoryId: string) {
  const peak = new Map<string, { projectCode: string; day: string; crew: number }>();
  for (const r of rows) {
    if (r.laborCategoryId !== categoryId) continue;
    const day = r.workDate.toISOString().slice(0, 10);
    const k = `${r.project.code}|${day}`;
    const cur = peak.get(k);
    if (!cur || r.crewSize > cur.crew) peak.set(k, { projectCode: r.project.code, day, crew: r.crewSize });
  }
  return [...peak.values()];
}

export async function buildSnapshot(companyId: string, projectId: string, asOf = new Date()): Promise<ProjectSnapshot> {
  const p = await db.project.findFirstOrThrow({ where: { id: projectId, companyId, deletedAt: null }, include: { venue: true } });
  const { standards, warehouseCity } = await loadStandards(companyId);
  const horizonFrom = new Date(Math.min(asOf.getTime(), p.setupStart.getTime()) - 86400000);
  const horizonTo = new Date((p.dismantleEnd ?? p.eventEnd).getTime() + 2 * 86400000);
  const [materials, items, labor, equipment, reqs, vehicles, drivers, cargo, routes, acc, hotels, branding, costs, rates, otherEq, otherVeh, otherLabor] = await Promise.all([
    db.material.findMany({ where: { companyId }, include: { supplier: true } }),
    db.productionItem.findMany({ where: { projectId }, include: { specs: true }, orderBy: { code: "asc" } }),
    db.laborCategory.findMany({ where: { companyId }, include: { rates: true } }),
    db.equipment.findMany({ where: { companyId }, include: { inventory: true } }),
    db.equipmentRequirement.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
    db.vehicle.findMany({ where: { companyId } }),
    db.driver.count({ where: { companyId, available: true } }),
    db.cargoItem.findMany({ where: { projectId, sourceType: { in: ["OTHER", "PRINT"] } } }),
    db.routeEstimate.findMany({ where: { companyId } }),
    db.accommodationAssignment.findMany({ where: { projectId }, include: { department: true } }),
    db.hotel.findMany({ where: { companyId }, include: { roomTypes: true } }),
    db.brandingItem.findMany({ where: { projectId }, include: { vendor: true }, orderBy: { createdAt: "asc" } }),
    db.costItem.findMany({ where: { projectId, generated: false } }),
    db.exchangeRate.findMany({ where: { companyId } }),
    db.resourceAssignment.findMany({ where: { resourceType: "EQUIPMENT", projectId: { not: projectId }, project: { companyId, deletedAt: null, status: { notIn: ["CANCELLED", "COMPLETED"] } } }, include: { project: { select: { code: true } } } }),
    db.resourceAssignment.findMany({ where: { resourceType: "VEHICLE", projectId: { not: projectId }, project: { companyId, deletedAt: null, status: { notIn: ["CANCELLED", "COMPLETED"] } } }, include: { project: { select: { code: true } } } }),
    // crews planned on other active projects inside this project's horizon (P2-F: no double-counted headcount)
    db.laborAssignment.findMany({ where: { projectId: { not: projectId }, workDate: { gte: horizonFrom, lte: horizonTo }, laborCategory: { companyId }, project: { companyId, deletedAt: null, status: { notIn: ["CANCELLED", "COMPLETED"] } } }, select: { laborCategoryId: true, workDate: true, crewSize: true, project: { select: { code: true } } } }),
  ]);
  return {
    asOf,
    project: {
      id: p.id, code: p.code, name: p.name, currency: p.currency, participants: p.participants,
      eventStart: p.eventStart, eventEnd: p.eventEnd, setupStart: p.setupStart, setupEnd: p.setupEnd, dismantleStart: p.dismantleStart, dismantleEnd: p.dismantleEnd,
      budgetAmount: num(p.budgetAmount), location: p.location, originCity: warehouseCity,
    },
    venue: p.venue ? { name: p.venue.name, city: p.venue.city, accessOpens: p.venue.accessOpens, accessCloses: p.venue.accessCloses, powerCapacityKw: p.venue.powerCapacityKw } : null,
    standards,
    materials: materials.map((m) => ({
      id: m.id, code: m.code, name: m.name, category: m.category, unit: m.unit, stockLengthM: m.stockLengthM, stockWidthM: m.stockWidthM, thicknessMm: m.thicknessMm,
      weightPerUnitKg: m.weightPerUnitKg, coverageM2PerL: m.coverageM2PerL, wasteFactorPct: m.wasteFactorPct, kerfMm: m.kerfMm, edgeTrimMm: m.edgeTrimMm, grainDirection: m.grainDirection,
      unitCost: num(m.unitCost), currency: m.currency, status: m.status, supplierName: m.supplier?.name ?? null, supplierLeadTimeDays: m.supplier?.leadTimeDays ?? null, stockQty: m.stockQty,
    })),
    productionItems: items.map((it) => ({
      id: it.id, code: it.code, name: it.name, category: it.category, quantity: it.quantity, widthM: it.widthM, heightM: it.heightM, depthM: it.depthM,
      boardMaterialId: it.boardMaterialId, finishing: it.finishing, paintCoats: it.paintCoats, drawingStatus: it.drawingStatus, installationDay: it.installationDay,
      packedVolumeM3: it.packedVolumeM3, packedWeightKg: it.packedWeightKg, engineeringApprovalRequired: it.engineeringApprovalRequired,
      specs: it.specs.sort((a, b) => a.id.localeCompare(b.id)).map((s) => ({ id: s.id, kind: s.kind, label: s.label, materialId: s.materialId, lengthM: s.lengthM, widthM: s.widthM, quantity: s.quantity, sides: s.sides, coats: s.coats })),
    })),
    laborCategories: labor.map((l) => ({
      id: l.id, key: l.key, name: l.name, dailyHours: l.dailyHours, breakHours: l.breakHours, maxOvertimeHours: l.maxOvertimeHours, dailyRate: num(l.dailyRate), overtimeHourlyRate: num(l.overtimeHourlyRate),
      currency: l.currency, headcount: l.headcountAvailable, status: l.status, committedElsewhere: committedByCategory(otherLabor, l.id), rates: l.rates.filter((r) => r.status !== "RETIRED").map((r) => ({ activity: r.activity, unitOfWork: r.unitOfWork, hoursPerUnit: r.hoursPerUnit, status: r.status })),
    })),
    equipment: equipment.map((e) => ({
      id: e.id, code: e.code, category: e.category, model: e.model, weightKg: e.weightKg, caseVolumeM3: e.caseVolumeM3, powerW: e.powerW, setupMinutes: e.setupMinutes, techniciansRequired: e.techniciansRequired,
      rentalDailyRate: num(e.rentalDailyRate), currency: e.currency, ownership: e.ownership, ownedQty: e.inventory.reduce((s, i) => s + i.quantity, 0), outOfService: e.inventory.reduce((s, i) => s + i.outOfService, 0),
      allocatedElsewhere: otherEq.filter((a) => a.resourceId === e.id).map((a) => ({ projectCode: a.project.code, start: a.startAt, end: a.endAt, quantity: a.quantity })),
    })),
    equipmentRequirements: reqs.map((r) => ({ id: r.id, category: r.category, description: r.description, equipmentId: r.equipmentId, quantity: r.quantity, backupQuantity: r.backupQuantity })),
    vehicles: vehicles.map((v) => ({
      id: v.id, code: v.code, type: v.type, payloadKg: v.payloadKg, volumeM3: v.volumeM3, internalLengthM: v.internalLengthM, internalWidthM: v.internalWidthM, internalHeightM: v.internalHeightM,
      dailyCost: num(v.dailyCost), currency: v.currency, available: v.available, maintenanceStatus: v.maintenanceStatus,
      bookedElsewhere: otherVeh.filter((a) => a.resourceId === v.id).map((a) => ({ projectCode: a.project.code, start: a.startAt, end: a.endAt })),
    })),
    driversAvailable: drivers,
    extraCargo: cargo.map((c) => ({ id: c.id, sourceType: c.sourceType, name: c.name, quantity: c.quantity, lengthM: c.lengthM, widthM: c.widthM, heightM: c.heightM, unitWeightKg: c.unitWeightKg, unitVolumeM3: c.unitVolumeM3, fragile: c.fragile })),
    routes: routes.map((r) => ({ origin: r.origin, destination: r.destination, distanceKm: r.distanceKm, durationHours: r.durationHours, approved: r.approved, source: r.source })),
    accommodation: acc.map((a) => ({ id: a.id, guestName: a.guestName, personKey: a.userId ?? a.employeeCode ?? a.guestName, department: a.department?.key ?? null, jobRole: a.jobRole, hotelId: a.hotelId, roomTypeId: a.roomTypeId, roomLabel: a.roomLabel, sharedRoom: a.sharedRoom, checkIn: a.checkIn, checkOut: a.checkOut, bookingStatus: a.bookingStatus, confirmationRef: a.confirmationRef })),
    hotels: hotels.map((h) => ({ id: h.id, name: h.name, roomTypes: h.roomTypes.map((t) => ({ id: t.id, name: t.name, capacity: t.capacity, nightlyRate: num(t.nightlyRate), currency: t.currency, roomsAvailable: t.roomsAvailable })) })),
    branding: branding.map((b) => ({ id: b.id, name: b.name, widthM: b.widthM, heightM: b.heightM, quantity: b.quantity, material: b.material, printMethod: b.printMethod, leadTimeDays: b.leadTimeDays, vendorName: b.vendor?.name ?? null, unitCost: num(b.unitCost), currency: b.currency, clientApprovalDeadline: b.clientApprovalDeadline, deliveryDeadline: b.deliveryDeadline, approvalStatus: b.approvalStatus })),
    manualCosts: costs.map((c) => ({ id: c.id, category: c.category, description: c.description, quantity: c.quantity, unit: c.unit, unitCost: Number(c.unitCost), currency: c.currency, basis: c.basis })),
    exchangeRates: rates.map((r) => ({ from: r.fromCurrency, to: r.toCurrency, rate: r.rate, source: r.source, rateDate: r.rateDate })),
  };
}
