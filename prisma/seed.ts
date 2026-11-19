/**
 * npm run db:seed — builds a complete, connected DEMONSTRATION environment.
 * ════════════════════════════════════════════════════════════════════════
 *  DEMO DATA — NOT APPROVED PARADIGM COMPANY DATA
 * ════════════════════════════════════════════════════════════════════════
 * Refuses to run in production unless ALLOW_DEMO_SEED=true is set explicitly.
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import PDFDocument from "pdfkit";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import * as D from "../src/demo/aswan";
import { DEFAULT_STANDARDS } from "../src/engines/snapshot";
import { ROLE_PERMISSIONS, PERMISSIONS, ROLE_LABELS, DEPARTMENTS, DEPARTMENT_APPROVER_ROLE } from "../src/lib/permissions";
import { generatePlan, approvePlan } from "../src/server/services/planning";

const db = new PrismaClient();
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "EventOps!2026";
const d = (s: string) => new Date(s);
const day = (s: string) => new Date(`${s}T12:00:00Z`);
const H = 3600000;

async function reset() {
  // development reset: truncate every application table (keeps the migrations table)
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) await db.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

async function makePdf(lines: string[], title: string): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.fontSize(9).fillColor("#B45309").text(D.DEMO_LABEL);
    doc.moveDown(0.5).fontSize(16).fillColor("#061520").text(title);
    doc.moveDown();
    doc.fontSize(10).fillColor("#111");
    lines.forEach((l) => doc.text(l));
    doc.end();
  });
}

async function storeFile(companyId: string, name: string, data: Buffer) {
  const key = `${companyId}/demo/${randomUUID()}${path.extname(name)}`;
  const p = path.resolve(process.env.STORAGE_LOCAL_DIR ?? "./storage/uploads", key);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, data);
  return { key, sha: createHash("sha256").update(data).digest("hex") };
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") throw new Error("Refusing to seed demo data in production (set ALLOW_DEMO_SEED=true to override deliberately).");
  console.log("▶ Resetting demo database…");
  await reset();

  const company = await db.company.create({ data: { name: "Paradigm LTD", slug: "paradigm", country: "EG", defaultCurrency: "EGP", timezone: "Africa/Cairo" } });
  const C = company.id;

  // ── permissions, roles, departments ──
  const perms = new Map<string, string>();
  for (const [key, description] of Object.entries(PERMISSIONS)) perms.set(key, (await db.permission.create({ data: { key, description } })).id);
  const roles = new Map<string, string>();
  for (const [key, list] of Object.entries(ROLE_PERMISSIONS)) {
    const r = await db.role.create({ data: { companyId: C, key, name: ROLE_LABELS[key], permissions: { create: list.map((p) => ({ permissionId: perms.get(p)! })) } } });
    roles.set(key, r.id);
  }
  const depts = new Map<string, string>();
  for (const dep of DEPARTMENTS) depts.set(dep.key, (await db.department.create({ data: { companyId: C, key: dep.key, name: dep.name, nameAr: dep.nameAr } })).id);

  // ── demo users: role-based placeholders, NOT real employees ──
  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const userDefs = [
    { email: "admin@demo.eventops.local", name: "Demo Super Admin", role: "SUPER_ADMIN", dept: "MANAGEMENT", title: "Platform administrator" },
    { email: "pm@demo.eventops.local", name: "Demo Project Manager", role: "PROJECT_MANAGER", dept: "PMO", title: "Senior Project Manager" },
    { email: "account@demo.eventops.local", name: "Demo Account Manager", role: "ACCOUNT_MANAGER", dept: "ACCOUNT", title: "Account Manager" },
    { email: "production@demo.eventops.local", name: "Demo Production Manager", role: "PRODUCTION_MANAGER", dept: "PRODUCTION", title: "Production Manager" },
    { email: "production.member@demo.eventops.local", name: "Demo Production Engineer", role: "DEPARTMENT_MEMBER", dept: "PRODUCTION", title: "Production Engineer", member: true },
    { email: "av@demo.eventops.local", name: "Demo AV Manager", role: "AV_MANAGER", dept: "AV", title: "AV & Technical Manager" },
    { email: "logistics@demo.eventops.local", name: "Demo Logistics Manager", role: "LOGISTICS_MANAGER", dept: "LOGISTICS", title: "Logistics Manager" },
    { email: "accommodation@demo.eventops.local", name: "Demo Accommodation Manager", role: "ACCOMMODATION_MANAGER", dept: "ACCOMMODATION", title: "Accommodation Coordinator" },
    { email: "creative@demo.eventops.local", name: "Demo Creative Manager", role: "CREATIVE_MANAGER", dept: "CREATIVE", title: "Creative Director" },
    { email: "procurement@demo.eventops.local", name: "Demo Procurement Manager", role: "PROCUREMENT_MANAGER", dept: "PROCUREMENT", title: "Procurement Lead" },
    { email: "finance@demo.eventops.local", name: "Demo Finance Officer", role: "FINANCE", dept: "FINANCE", title: "Finance Controller" },
    { email: "viewer@demo.eventops.local", name: "Demo Viewer", role: "VIEWER", dept: "MANAGEMENT", title: "Observer" },
  ];
  const users = new Map<string, string>();
  for (const u of userDefs) {
    const created = await db.user.create({ data: { companyId: C, email: u.email, name: u.name, passwordHash: hash, roleId: roles.get(u.role)!, jobTitle: u.title, isDemo: true, memberships: { create: { departmentId: depts.get(u.dept)!, isManager: !u.member } } } });
    users.set(u.role === "DEPARTMENT_MEMBER" ? "MEMBER" : u.role, created.id);
  }
  const U = (k: string) => users.get(k)!;
  const ctx = { companyId: C, userId: U("PROJECT_MANAGER") };

  // ── company standards (DEMO, versioned) ──
  const std = (key: string, category: string, label: string, value: Prisma.InputJsonValue, unit?: string, status: "DEMO" | "PENDING" = "DEMO", description?: string) =>
    db.companyStandard.create({ data: { companyId: C, key, category, label, value, unit, status, description: description ?? "DEMO value — requires approval by an authorised administrator" } });
  await std("PLANNING_STANDARDS", "Scheduling", "Working calendars, buffers and activity mapping", JSON.parse(JSON.stringify(DEFAULT_STANDARDS)));
  await std("RISK_THRESHOLDS", "Risk", "Risk severity thresholds (probability × impact)", DEFAULT_STANDARDS.riskThresholds, "score");
  await std("CONTINGENCY_PCT", "Budget", "Default contingency", 10, "%");
  await std("DEFAULT_WASTE_PCT", "Materials", "Default waste allowance (estimates)", 10, "%");
  await std("VEHICLE_FILL_FACTOR", "Logistics", "Vehicle usable capacity factor", 0.85, "ratio");
  await std("WAREHOUSE_CITY", "Logistics", "Main warehouse / workshop city", "Cairo");
  await std("PROPOSAL:CARPENTER:INSTALLATION", "Labour", "Proposed: carpenter installation productivity", { activity: "INSTALLATION", from: 0.35, to: 0.4, unit: "h/m2", evidence: "DEMO-CAI-2611 actual installation took 14% longer than planned" }, "h/m2", "PENDING", "Recommendation generated from actual-vs-planned analysis. Not applied until approved.");

  // ── vendors & libraries ──
  const vendors = new Map<string, string>();
  for (const v of D.DEMO_VENDORS) vendors.set(v.key, (await db.vendor.create({ data: { companyId: C, name: v.name, location: v.location, services: [...v.services], leadTimeDays: v.leadTimeDays, contactName: "Demo contact", phone: "+20 000 000 0000", email: `${v.key.toLowerCase()}@vendor.demo`, status: "DEMO", isDemo: true } })).id);
  const catalogs = new Map<string, string>();
  for (const cat of ["BOARD", "TIMBER", "PAINT", "PRIMER", "FASTENER", "CARPET", "VINYL"]) catalogs.set(cat, (await db.materialCatalog.create({ data: { companyId: C, name: cat.charAt(0) + cat.slice(1).toLowerCase(), category: cat as never } })).id);
  const mats = new Map<string, string>();
  for (const m of D.DEMO_MATERIALS) {
    const r = await db.material.create({ data: {
      companyId: C, catalogId: catalogs.get(m.category), code: m.code, name: m.name, category: m.category as never, unit: m.unit,
      stockLengthM: "stockLengthM" in m ? m.stockLengthM : null, stockWidthM: "stockWidthM" in m ? m.stockWidthM : null, thicknessMm: "thicknessMm" in m ? m.thicknessMm : null,
      weightPerUnitKg: "weightPerUnitKg" in m ? m.weightPerUnitKg : null, coverageM2PerL: "coverageM2PerL" in m ? m.coverageM2PerL : null, wasteFactorPct: m.wasteFactorPct,
      kerfMm: "kerfMm" in m ? m.kerfMm : null, edgeTrimMm: "edgeTrimMm" in m ? m.edgeTrimMm : null, grainDirection: "grainDirection" in m ? m.grainDirection : false,
      unitCost: m.unitCost, supplierId: vendors.get(m.supplier), stockQty: m.stockQty, status: "DEMO", isDemo: true,
    } });
    mats.set(m.code, r.id);
  }
  for (const l of D.DEMO_LABOR) {
    await db.laborCategory.create({ data: { companyId: C, key: l.key, name: l.name, nameAr: l.nameAr, headcountAvailable: l.headcount, dailyHours: l.dailyHours, breakHours: l.breakHours, maxOvertimeHours: l.maxOvertimeHours, dailyRate: l.dailyRate, overtimeHourlyRate: l.overtimeHourlyRate, status: "DEMO", location: "Cairo", rates: { create: l.rates.map(([activity, unitOfWork, hoursPerUnit]) => ({ activity, unitOfWork, hoursPerUnit, status: "DEMO" as const, source: "DEMO placeholder — not an approved Paradigm productivity rate" })) } } });
  }
  const eq = new Map<string, string>();
  for (const e of D.DEMO_EQUIPMENT) {
    const r = await db.equipment.create({ data: { companyId: C, code: e.code, category: e.category as never, model: e.model, manufacturer: e.manufacturer, weightKg: e.weightKg, caseVolumeM3: e.caseVolumeM3, powerW: e.powerW, setupMinutes: e.setupMinutes, techniciansRequired: e.techniciansRequired, rentalDailyRate: e.rentalDailyRate, status: "DEMO", isDemo: true, inventory: { create: { location: "Cairo warehouse", quantity: e.owned, outOfService: e.outOfService, condition: "Good" } } } });
    eq.set(e.code, r.id);
  }
  const veh = new Map<string, string>();
  for (const v of D.DEMO_VEHICLES) veh.set(v.code, (await db.vehicle.create({ data: { companyId: C, code: v.code, type: v.type as never, description: v.description, payloadKg: v.payloadKg, volumeM3: v.volumeM3, internalLengthM: v.L, internalWidthM: v.W, internalHeightM: v.H, dailyCost: v.dailyCost, available: v.available, maintenanceStatus: v.maintenanceStatus, location: "Cairo", isDemo: true } })).id);
  for (let i = 1; i <= 4; i++) await db.driver.create({ data: { companyId: C, name: `Demo Driver ${i}`, licenseType: i <= 2 ? "Heavy" : "Light", isDemo: true } });
  await db.routeEstimate.create({ data: { companyId: C, ...D.DEMO_ROUTE } });
  await db.routeEstimate.create({ data: { companyId: C, origin: "Cairo", destination: "Cairo", distanceKm: 25, durationHours: 1.5, approved: false, source: "DEMO intra-city estimate" } });
  await db.routeEstimate.create({ data: { companyId: C, origin: "Cairo", destination: "Alexandria", distanceKm: 220, durationHours: 3.5, approved: false, source: "DEMO estimate" } });
  const hotels = new Map<string, { id: string; types: Map<string, string> }>();
  for (const h of D.DEMO_HOTELS) {
    const r = await db.hotel.create({ data: { companyId: C, name: h.name, city: h.city, stars: h.stars, contact: "Demo reservations desk", isDemo: true, roomTypes: { create: h.roomTypes.map((t) => ({ ...t })) } }, include: { roomTypes: true } });
    hotels.set(h.key, { id: r.id, types: new Map(r.roomTypes.map((t) => [t.name, t.id])) });
  }
  await db.exchangeRate.create({ data: { companyId: C, fromCurrency: D.DEMO_FX.from, toCurrency: D.DEMO_FX.to, rate: D.DEMO_FX.rate, source: D.DEMO_FX.source, rateDate: day(D.DEMO_FX.rateDate) } });
  const venue = await db.eventVenue.create({ data: { companyId: C, ...D.DEMO_VENUE, maxVehicleType: "LARGE_TRUCK", accessNotes: "DEMO: loading dock at rear, security list required 48 h before access", isDemo: true } });
  const venueCairo = await db.eventVenue.create({ data: { companyId: C, name: "Demo Cairo Exhibition Hall B", city: "Cairo", accessOpens: "06:00", accessCloses: "24:00", powerCapacityKw: 200, loadingDock: true, isDemo: true } });

  // historical events (for accuracy analysis)
  await db.historicalEvent.create({ data: { companyId: C, name: "DEMO — Red Sea Partner Forum 2025", eventDate: d("2025-10-14T07:00:00Z"), location: "Hurghada", participants: 220, isDemo: true, lessonsLearned: "DEMO: backdrop painting took longer due to humidity; add drying buffer.", metrics: [{ category: "MDF sheets", planned: 26, actual: 28, unit: "sheet" }, { category: "Carpenter hours", planned: 140, actual: 158, unit: "h" }, { category: "Setup duration", planned: 30, actual: 33, unit: "h" }, { category: "Vehicles", planned: 2, actual: 2, unit: "vehicles" }, { category: "Total cost", planned: 610000, actual: 652000, unit: "EGP" }] } });
  await db.historicalEvent.create({ data: { companyId: C, name: "DEMO — Delta Pharma Summit 2025", eventDate: d("2025-06-02T07:00:00Z"), location: "Cairo", participants: 300, isDemo: true, lessonsLearned: "DEMO: LED rental arrived 4 h late; confirm dispatch the day before.", metrics: [{ category: "MDF sheets", planned: 18, actual: 18, unit: "sheet" }, { category: "Carpenter hours", planned: 96, actual: 101, unit: "h" }, { category: "Setup duration", planned: 20, actual: 24, unit: "h" }, { category: "Paint", planned: 2, actual: 2, unit: "pail" }, { category: "Total cost", planned: 480000, actual: 471500, unit: "EGP" }] } });

  // ── helper to create a project with department inputs ──
  async function createItems(projectId: string, defs: typeof D.DEMO_PRODUCTION_ITEMS, submissionId: string | null) {
    for (const it of defs) {
      await db.productionItem.create({ data: {
        projectId, submissionId, code: it.code, name: it.name, category: it.category as never, quantity: it.quantity, widthM: it.widthM, heightM: it.heightM, depthM: it.depthM,
        boardMaterialId: it.board ? mats.get(it.board) : null, finishing: it.finishing, color: it.color, paintCoats: it.paintCoats, constructionMethod: it.constructionMethod, installationMethod: it.installationMethod,
        installationDay: it.installationDay, drawingStatus: it.drawingStatus, engineeringApprovalRequired: it.engineeringApprovalRequired, packedVolumeM3: it.packedVolumeM3, notes: it.notes,
        specs: { create: it.specs.map((s) => ({ kind: s.kind, label: s.label, materialId: s.material ? mats.get(s.material) : null, lengthM: s.lengthM ?? null, widthM: s.widthM ?? null, quantity: s.quantity, sides: s.sides ?? 1, coats: s.coats ?? null, drawingRef: s.drawingRef ?? null })) },
      } });
    }
  }
  const submission = (projectId: string, dept: string, by: string, title: string, status: Prisma.DepartmentSubmissionCreateInput["status"], extra: Partial<Prisma.DepartmentSubmissionUncheckedCreateInput> = {}) =>
    db.departmentSubmission.create({ data: { projectId, departmentId: depts.get(dept)!, submittedById: by, title, status, submittedAt: status === "DRAFT" ? null : new Date(), ...extra } });

  // ═════════════ Project 1: Aswan Corporate Conference (planning, under review) ═════════════
  console.log("▶ Aswan Corporate Conference…");
  const aswan = await db.project.create({ data: {
    companyId: C, code: "DEMO-ASW-2612", name: "Aswan Corporate Conference", client: "Demo Client — Corporate Banking Group", category: "Corporate conference", location: "Aswan", venueId: venue.id,
    eventStart: d(D.ASWAN_DATES.eventStart), eventEnd: d(D.ASWAN_DATES.eventEnd), setupStart: d(D.ASWAN_DATES.setupStart), setupEnd: d(D.ASWAN_DATES.setupEnd), dismantleStart: d(D.ASWAN_DATES.dismantleStart), dismantleEnd: d(D.ASWAN_DATES.dismantleEnd),
    participants: 150, status: "PLANNING", budgetAmount: 1500000, currency: "EGP", ownerId: U("ACCOUNT_MANAGER"), projectManagerId: U("PROJECT_MANAGER"), accountManagerId: U("ACCOUNT_MANAGER"), isDemo: true,
    description: "Two-day corporate conference for 150 participants with main stage, wooden backdrop, LED wall, sound, lighting and microphones. Production and AV travel from Cairo. " + D.DEMO_LABEL,
  } });
  const A = aswan.id;
  for (const [k, lead, status, due] of [["ACCOUNT", "ACCOUNT_MANAGER", "APPROVED", "2026-11-20"], ["PRODUCTION", "PRODUCTION_MANAGER", "APPROVED", "2026-11-22"], ["AV", "AV_MANAGER", "SUBMITTED", "2026-11-22"], ["LOGISTICS", "LOGISTICS_MANAGER", "APPROVED", "2026-11-25"], ["ACCOMMODATION", "ACCOMMODATION_MANAGER", "NEEDS_INFORMATION", "2026-11-25"], ["CREATIVE", "CREATIVE_MANAGER", "UNDER_REVIEW", "2026-11-28"], ["PROCUREMENT", "PROCUREMENT_MANAGER", "DRAFT", "2026-11-28"]] as const) {
    await db.projectDepartment.create({ data: { projectId: A, departmentId: depts.get(k)!, leadId: U(lead), status, dueDate: day(due) } });
  }
  for (const [k, role] of [["PROJECT_MANAGER", "Project manager"], ["ACCOUNT_MANAGER", "Account manager"], ["PRODUCTION_MANAGER", "Production lead"], ["MEMBER", "Production engineer"], ["AV_MANAGER", "AV lead"], ["LOGISTICS_MANAGER", "Logistics lead"], ["ACCOMMODATION_MANAGER", "Accommodation"], ["CREATIVE_MANAGER", "Creative lead"], ["PROCUREMENT_MANAGER", "Procurement"], ["FINANCE", "Finance"]]) await db.projectMember.create({ data: { projectId: A, userId: U(k), role } });
  for (const [cat, title, q, unit] of [["Scope", "Main stage 12 × 6 m with carpet", 1, "stage"], ["Scope", "Wooden backdrop 8 × 3 m, MDF, painted black", 1, "backdrop"], ["Scope", "LED wall approx. 6 × 3.5 m", 1, "wall"], ["Scope", "PA, wireless microphones, stage lighting", 1, "system"], ["Participants", "Conference participants", 150, "people"], ["Deliverable", "Registration area with 2 branded counters", 2, "counters"]] as const)
    await db.eventRequirement.create({ data: { projectId: A, category: cat, title, quantity: q, unit, status: "APPROVED" } });

  const subAcc = await submission(A, "ACCOUNT", U("ACCOUNT_MANAGER"), "Event brief & client scope", "APPROVED", { method: "FORM", rawText: "Client brief received; scope confirmed in kickoff meeting (demo).", reviewerId: U("PROJECT_MANAGER"), reviewedAt: new Date() });
  void subAcc;
  const subProd = await submission(A, "PRODUCTION", U("PRODUCTION_MANAGER"), "Production requirements — stage, backdrop, counters, podium", "APPROVED", { method: "FORM", formStep: 10, reviewerId: U("PRODUCTION_MANAGER"), reviewedAt: new Date(), reviewNote: "Technical specifications approved for planning. Podium drawing still pending (estimate only)." });
  await createItems(A, D.DEMO_PRODUCTION_ITEMS, subProd.id);
  await db.submissionField.createMany({ data: [
    { submissionId: subProd.id, key: "BKD-01.width", label: "Backdrop width", value: "8", unit: "m", state: "APPROVED", method: "MANUAL" },
    { submissionId: subProd.id, key: "BKD-01.height", label: "Backdrop height", value: "3", unit: "m", state: "APPROVED", method: "MANUAL" },
    { submissionId: subProd.id, key: "BKD-01.material", label: "Backdrop board", value: "MDF 18 mm", state: "APPROVED", method: "MANUAL" },
    { submissionId: subProd.id, key: "POD-01.drawing", label: "Podium drawing", value: null, state: "NEEDS_INFORMATION", method: "MANUAL" },
  ] });
  // conversational draft (AI/rule-based extraction) awaiting completion
  await submission(A, "PRODUCTION", U("MEMBER"), "Conversational input — VIP lounge partition", "NEEDS_INFORMATION", {
    method: "AI_CONVERSATION", rawText: "We need a 4 meter wide, 2.4 meter high partition wall for the VIP lounge, MDF painted white, install on the second setup day.",
    extracted: { engine: "RULE_BASED", category: "DECORATIVE", name: "VIP lounge partition", widthM: 4, heightM: 2.4, material: "MDF", finishing: "painted white", installationDay: 2 },
    missingFields: [{ field: "thicknessMm", label: "Board thickness", question: "Which MDF thickness should be used?" }, { field: "depthM", label: "Depth / packed volume", question: "What is the depth or packed volume of the partition?" }, { field: "drawing", label: "Technical drawing", question: "Please upload the partition drawing." }, { field: "paintCoats", label: "Paint coats", question: "How many coats of white paint?" }],
  });
  const subAv = await submission(A, "AV", U("AV_MANAGER"), "AV & technical requirements", "SUBMITTED", { method: "FORM" });
  for (const r of D.DEMO_EQUIPMENT_REQUIREMENTS) await db.equipmentRequirement.create({ data: { projectId: A, submissionId: subAv.id, equipmentId: eq.get(r.equipment), category: r.category as never, description: r.description, quantity: r.quantity, backupQuantity: r.backup } });
  await submission(A, "LOGISTICS", U("LOGISTICS_MANAGER"), "Transportation requirements Cairo → Aswan", "APPROVED", { method: "FORM", rawText: "Transport from Cairo warehouse; arrival on first setup day 07:00; return after dismantle.", reviewerId: U("LOGISTICS_MANAGER"), reviewedAt: new Date() });
  for (const c of D.DEMO_EXTRA_CARGO) await db.cargoItem.create({ data: { projectId: A, sourceType: c.sourceType, name: c.name, quantity: c.quantity, lengthM: c.L, widthM: c.W, heightM: c.H, unitWeightKg: c.weight, fragile: c.fragile, state: "VERIFIED" } });
  await submission(A, "ACCOMMODATION", U("ACCOMMODATION_MANAGER"), "Staff rooming list", "NEEDS_INFORMATION", { method: "FORM", missingFields: [{ field: "guestName", label: "Rigger name", question: "Who is the rigger travelling to Aswan?" }] });
  for (const [i, r] of D.DEMO_ROOMING.entries()) {
    const h = hotels.get(r.hotel)!;
    await db.accommodationAssignment.create({ data: { projectId: A, guestName: r.guest, employeeCode: r.guest ? `DEMO-${String(i + 1).padStart(3, "0")}` : null, departmentId: depts.get(r.dept), jobRole: r.role, hotelId: h.id, roomTypeId: h.types.get(r.room), roomLabel: r.label, sharedRoom: !!r.label, arrivalDate: day(r.in), checkIn: day(r.in), checkOut: day(r.out), bookingStatus: r.status as never, confirmationRef: r.status === "CONFIRMED" ? `DEMO-CNF-${1000 + i}` : null } });
  }
  await submission(A, "CREATIVE", U("CREATIVE_MANAGER"), "Branding & printing", "UNDER_REVIEW", { method: "FORM", rawText: "Roll-ups and counter wraps awaiting client artwork approval; signage quantities TBC." });
  for (const b of D.DEMO_BRANDING) await db.brandingItem.create({ data: { projectId: A, name: b.name, widthM: b.widthM, heightM: b.heightM, quantity: b.quantity, material: b.material, printMethod: b.printMethod, installationMethod: "Installed on site by helpers", vendorId: vendors.get("V-PRINT"), leadTimeDays: b.leadTimeDays, clientApprovalDeadline: day(b.clientApprovalDeadline), productionDeadline: day(b.clientApprovalDeadline), deliveryDeadline: day(b.deliveryDeadline), approvalStatus: b.approval as never, unitCost: b.unitCost, state: b.quantity == null ? "NEEDS_INFORMATION" : "ESTIMATED" } });
  for (const c of D.DEMO_MANUAL_COSTS) await db.costItem.create({ data: { projectId: A, category: c.category as never, description: c.description, quantity: c.quantity, unit: c.unit, unitCost: c.unitCost, amount: c.quantity * c.unitCost, currency: c.currency, basis: c.basis as never } });
  await db.projectBudget.create({ data: { projectId: A, currency: "EGP", totalBudget: 1500000, contingencyPct: 10, status: "PENDING" } });

  // documents with extraction review
  const dwg = await makePdf(["Item: BKD-01 Wooden backdrop", "Overall: 8000 mm W × 3000 mm H × 300 mm D", "Cladding: MDF 18 mm, panels 2000 × 1000 mm, qty 12", "Frame: timber 50×50 — studs 3000 mm ×9, rails 2000 mm ×16, braces 1500 mm ×8", "Finish: 1 coat primer + 2 coats matte black", "Installation: setup day 1, braced to stage rear", "Structural note: bracing to be approved by structural engineer"], "DWG-BKD-01 rev A — Backdrop technical specification");
  const f1 = await storeFile(C, "DWG-BKD-01-revA.pdf", dwg);
  const doc1 = await db.uploadedDocument.create({ data: { companyId: C, projectId: A, submissionId: subProd.id, uploadedById: U("PRODUCTION_MANAGER"), fileName: "DWG-BKD-01-revA.pdf", mimeType: "application/pdf", sizeBytes: dwg.length, storageKey: f1.key, sha256: f1.sha, category: "DRAWING", status: "APPROVED", textPreview: "DWG-BKD-01 rev A — 8000 × 3000 × 300 mm, MDF 18 mm panels 2000 × 1000 ×12…" } });
  await db.extractedDocumentData.createMany({ data: [
    { documentId: doc1.id, page: 1, field: "widthM", value: "8", unit: "m", snippet: "8000 mm W", method: "RULE_BASED", state: "APPROVED", reviewedById: U("PRODUCTION_MANAGER"), reviewedAt: new Date() },
    { documentId: doc1.id, page: 1, field: "heightM", value: "3", unit: "m", snippet: "3000 mm H", method: "RULE_BASED", state: "APPROVED", reviewedById: U("PRODUCTION_MANAGER"), reviewedAt: new Date() },
    { documentId: doc1.id, page: 1, field: "material", value: "MDF 18 mm", snippet: "MDF 18 mm", method: "RULE_BASED", state: "APPROVED", reviewedById: U("PRODUCTION_MANAGER"), reviewedAt: new Date() },
    { documentId: doc1.id, page: 1, field: "coats", value: "2", snippet: "2 coats matte black", method: "RULE_BASED", state: "UNDER_REVIEW" },
  ] });
  const avList = await makePdf(D.DEMO_EQUIPMENT_REQUIREMENTS.map((r) => `${r.quantity}${r.backup ? ` (+${r.backup} backup)` : ""} × ${r.description} [${r.equipment}]`), "AV equipment list — Aswan Corporate Conference");
  const f2 = await storeFile(C, "AV-equipment-list.pdf", avList);
  await db.uploadedDocument.create({ data: { companyId: C, projectId: A, submissionId: subAv.id, uploadedById: U("AV_MANAGER"), fileName: "AV-equipment-list.pdf", mimeType: "application/pdf", sizeBytes: avList.length, storageKey: f2.key, sha256: f2.sha, category: "SPEC", status: "SUBMITTED" } });

  // approvals for department submissions
  await db.approval.create({ data: { companyId: C, projectId: A, entityType: "SUBMISSION", entityId: subAv.id, title: "AV & technical requirements — Aswan Corporate Conference", requiredRole: DEPARTMENT_APPROVER_ROLE.AV, requestedById: U("AV_MANAGER"), description: "12 equipment lines, LED wall 84 cabinets + 6 backup" } });
  const creativeSub = await db.departmentSubmission.findFirstOrThrow({ where: { projectId: A, department: { key: "CREATIVE" } } });
  await db.approval.create({ data: { companyId: C, projectId: A, entityType: "SUBMISSION", entityId: creativeSub.id, title: "Branding & printing — Aswan Corporate Conference", requiredRole: DEPARTMENT_APPROVER_ROLE.CREATIVE, requestedById: U("CREATIVE_MANAGER") } });
  await db.comment.create({ data: { projectId: A, userId: U("PROJECT_MANAGER"), body: "Please confirm venue power capacity in writing before AV approval. (demo)" } });
  await db.comment.create({ data: { projectId: A, userId: U("PRODUCTION_MANAGER"), body: "Backdrop drawing rev A uploaded; podium drawing expected next week. (demo)" } });

  // ═════════════ Project 2: Alexandria Annual Gala (approved, holds 30 LED cabinets) ═════════════
  const alx = await db.project.create({ data: {
    companyId: C, code: D.DEMO_OTHER_PROJECT_ALLOCATION.projectCode, name: "Alexandria Annual Gala", client: "Demo Client — Shipping Group", category: "Gala dinner", location: "Alexandria",
    eventStart: d("2026-12-14T17:00:00Z"), eventEnd: d("2026-12-14T22:00:00Z"), setupStart: d("2026-12-12T06:00:00Z"), setupEnd: d("2026-12-14T14:00:00Z"), dismantleEnd: d("2026-12-15T10:00:00Z"),
    participants: 400, status: "APPROVED", budgetAmount: 950000, currency: "EGP", projectManagerId: U("PROJECT_MANAGER"), accountManagerId: U("ACCOUNT_MANAGER"), isDemo: true, description: D.DEMO_LABEL,
  } });
  await db.resourceAssignment.create({ data: { projectId: alx.id, resourceType: "EQUIPMENT", resourceId: eq.get("LED-P39")!, quantity: 30, startAt: d(D.DEMO_OTHER_PROJECT_ALLOCATION.start), endAt: d(D.DEMO_OTHER_PROJECT_ALLOCATION.end), status: "CONFIRMED" } });
  for (const k of ["PRODUCTION", "AV", "LOGISTICS"]) await db.projectDepartment.create({ data: { projectId: alx.id, departmentId: depts.get(k)!, status: "APPROVED" } });

  // ═════════════ Project 3: Hurghada Dealer Summit (awaiting inputs) ═════════════
  const hrg = await db.project.create({ data: {
    companyId: C, code: "DEMO-HRG-2703", name: "Hurghada Dealer Summit", client: "Demo Client — Automotive Distributor", category: "Dealer conference", location: "Hurghada",
    eventStart: d("2027-03-10T07:00:00Z"), eventEnd: d("2027-03-11T16:00:00Z"), setupStart: d("2027-03-08T05:00:00Z"), setupEnd: d("2027-03-09T21:00:00Z"),
    participants: 260, status: "AWAITING_INPUTS", budgetAmount: 2100000, currency: "EGP", ownerId: U("ACCOUNT_MANAGER"), projectManagerId: U("PROJECT_MANAGER"), accountManagerId: U("ACCOUNT_MANAGER"), isDemo: true, description: D.DEMO_LABEL,
  } });
  for (const [k, due] of [["PRODUCTION", "2026-12-20"], ["AV", "2026-12-20"], ["LOGISTICS", "2027-01-10"], ["ACCOMMODATION", "2027-01-15"], ["CREATIVE", "2027-01-20"]] as const) await db.projectDepartment.create({ data: { projectId: hrg.id, departmentId: depts.get(k)!, status: "DRAFT", dueDate: day(due) } });
  await db.eventRequirement.create({ data: { projectId: hrg.id, category: "Scope", title: "Exhibition stand for 6 car models + main stage", status: "SUBMITTED" } });

  // ═════════════ Project 4: Cairo Product Launch (in execution) ═════════════
  console.log("▶ Cairo Product Launch (execution demo)…");
  const cai = await db.project.create({ data: {
    companyId: C, code: "DEMO-CAI-2611", name: "Cairo Product Launch", client: "Demo Client — Consumer Electronics", category: "Product launch", location: "Cairo", venueId: venueCairo.id,
    eventStart: d("2026-11-20T15:00:00Z"), eventEnd: d("2026-11-20T21:00:00Z"), setupStart: d("2026-11-18T05:00:00Z"), setupEnd: d("2026-11-20T12:00:00Z"), dismantleStart: d("2026-11-20T21:00:00Z"), dismantleEnd: d("2026-11-21T10:00:00Z"),
    participants: 180, status: "PLANNING", budgetAmount: 680000, currency: "EGP", ownerId: U("ACCOUNT_MANAGER"), projectManagerId: U("PROJECT_MANAGER"), accountManagerId: U("ACCOUNT_MANAGER"), isDemo: true, description: "Evening product launch with backdrop, counters and LED wall. " + D.DEMO_LABEL,
  } });
  for (const k of ["PRODUCTION", "AV", "LOGISTICS", "CREATIVE"]) await db.projectDepartment.create({ data: { projectId: cai.id, departmentId: depts.get(k)!, status: "APPROVED" } });
  for (const [k, role] of [["PROJECT_MANAGER", "Project manager"], ["PRODUCTION_MANAGER", "Production lead"], ["MEMBER", "Site engineer"], ["AV_MANAGER", "AV lead"], ["LOGISTICS_MANAGER", "Logistics lead"]]) await db.projectMember.create({ data: { projectId: cai.id, userId: U(k), role } });
  const caiProd = await submission(cai.id, "PRODUCTION", U("PRODUCTION_MANAGER"), "Production requirements", "APPROVED", { reviewerId: U("PRODUCTION_MANAGER"), reviewedAt: d("2026-11-02T10:00:00Z") });
  const caiItems = D.DEMO_PRODUCTION_ITEMS.filter((i) => i.code === "BKD-01" || i.code === "CNT-01").map((i) => ({ ...i, installationDay: 1, packedVolumeM3: i.packedVolumeM3 ?? 2.2 }));
  await createItems(cai.id, caiItems, caiProd.id);
  const caiAv = await submission(cai.id, "AV", U("AV_MANAGER"), "AV requirements", "APPROVED", { reviewerId: U("AV_MANAGER"), reviewedAt: d("2026-11-02T10:00:00Z") });
  for (const r of [{ e: "LED-P39", c: "LED_SCREEN", t: "LED wall 4 × 2.5 m", q: 40, b: 4 }, { e: "LED-PROC", c: "LED_PROCESSOR", t: "LED processor", q: 1, b: 0 }, { e: "SPK-LA", c: "SPEAKER", t: "Line array", q: 4, b: 0 }, { e: "MIC-WL", c: "MICROPHONE", t: "Wireless microphones", q: 4, b: 1 }, { e: "LGT-PAR", c: "LIGHTING_FIXTURE", t: "Wash lights", q: 12, b: 0 }])
    await db.equipmentRequirement.create({ data: { projectId: cai.id, submissionId: caiAv.id, equipmentId: eq.get(r.e), category: r.c as never, description: r.t, quantity: r.q, backupQuantity: r.b } });
  await submission(cai.id, "LOGISTICS", U("LOGISTICS_MANAGER"), "Intra-city transport", "APPROVED", { reviewerId: U("LOGISTICS_MANAGER"), reviewedAt: d("2026-11-02T10:00:00Z") });
  await submission(cai.id, "CREATIVE", U("CREATIVE_MANAGER"), "Launch branding", "APPROVED", { reviewerId: U("CREATIVE_MANAGER"), reviewedAt: d("2026-11-02T10:00:00Z") });
  await db.brandingItem.create({ data: { projectId: cai.id, name: "Launch backdrop graphic 8 × 3 m", widthM: 8, heightM: 3, quantity: 1, material: "Printed fabric", printMethod: "Dye-sublimation", vendorId: vendors.get("V-PRINT"), leadTimeDays: 3, deliveryDeadline: day("2026-11-16"), approvalStatus: "APPROVED", unitCost: 7800, state: "ESTIMATED" } });

  const caiPlan = await generatePlan(ctx, cai.id, { asOf: d("2026-11-03T07:00:00Z"), label: "Baseline plan" });
  const caiApproval = await db.approval.findFirstOrThrow({ where: { projectId: cai.id, entityType: "PLAN", status: "PENDING" } });
  await approvePlan(ctx, caiApproval.id, "Approved for execution (demo).", true);
  await db.project.update({ where: { id: cai.id }, data: { status: "IN_EXECUTION" } });
  await db.procurementRequest.updateMany({ where: { projectId: cai.id }, data: { status: "DELIVERED" } });
  await db.procurementRequest.updateMany({ where: { projectId: cai.id, code: "MAT:MDF-18" }, data: { status: "DELIVERED" } });

  // execution progress against the approved plan
  const now = d(D.ASWAN_DATES.asOf).getTime();
  const tasks = await db.task.findMany({ where: { projectId: cai.id }, orderBy: { plannedStart: "asc" } });
  for (const t of tasks) {
    if (!t.plannedStart || !t.plannedEnd) continue;
    const s = t.plannedStart.getTime(), e = t.plannedEnd.getTime();
    if (e <= now - 3 * H) {
      const overrun = t.planKey === "FAB:BKD-01" ? 1.18 : t.planKey === "INST:BKD-01" ? 1.14 : t.planKey?.startsWith("PROC:") ? 1 : 1.04;
      await db.task.update({ where: { id: t.id }, data: { status: "COMPLETED", percentComplete: 100, actualStart: new Date(s), actualEnd: new Date(s + (e - s) * overrun) } });
    } else if (s <= now) {
      const delayed = t.planKey?.startsWith("AVI:SPK");
      await db.task.update({ where: { id: t.id }, data: { status: delayed ? "DELAYED" : "IN_PROGRESS", percentComplete: delayed ? 35 : 60, actualStart: new Date(s + (delayed ? 2 * H : 0)) } });
      if (delayed) await db.executionUpdate.create({ data: { projectId: cai.id, taskId: t.id, userId: U("AV_MANAGER"), type: "DELAY", status: "DELAYED", message: "Line-array installation running 2 h late — rigging points at venue not released on time (demo).", delayMinutes: 120, delayReason: "Venue access / rigging release", percentComplete: 35, createdAt: new Date(now - 1 * H) } });
    }
  }
  const done = await db.task.findMany({ where: { projectId: cai.id, status: "COMPLETED" }, take: 6, orderBy: { actualEnd: "desc" } });
  for (const t of done) await db.executionUpdate.create({ data: { projectId: cai.id, taskId: t.id, userId: t.phase === "SETUP" ? U("MEMBER") : U("PRODUCTION_MANAGER"), type: "STATUS", status: "COMPLETED", message: `${t.name} completed`, percentComplete: 100, createdAt: t.actualEnd ?? new Date() } });
  await db.executionUpdate.create({ data: { projectId: cai.id, userId: U("MEMBER"), type: "INSPECTION", message: "Backdrop frame inspected — bracing OK, two face panels need re-fixing (demo).", createdAt: new Date(now - 2 * H) } });
  await db.executionUpdate.create({ data: { projectId: cai.id, userId: U("LOGISTICS_MANAGER"), type: "ISSUE", message: "Venue loading dock shared with another event 08:00–10:00 — unloading re-sequenced (demo).", createdAt: new Date(now - 26 * H) } });

  // actual consumption vs planned (from the approved plan)
  const plan = caiPlan.plan;
  for (const b of plan.production.boq) {
    const factor = b.code === "MDF-18" ? 1.1 : b.code === "TMB-50" ? 0.95 : 1;
    await db.actualConsumption.create({ data: { projectId: cai.id, resourceType: "MATERIAL", materialId: b.materialId, category: `MATERIAL:${b.code}`, description: b.name, plannedQuantity: b.purchaseQuantity, actualQuantity: Math.round(b.purchaseQuantity * factor), unit: b.unit, recordedById: U("PRODUCTION_MANAGER"), note: factor > 1 ? "Two sheets damaged during cutting (demo)" : null } });
  }
  for (const t of plan.trades.filter((x) => x.phase === "WORKSHOP")) await db.actualConsumption.create({ data: { projectId: cai.id, resourceType: "LABOR", category: `LABOR:${t.laborKey}:${t.phase}`, description: `${t.name} — ${t.phase.toLowerCase()}`, plannedQuantity: t.totalHours, actualQuantity: Math.round(t.totalHours * 1.12 * 10) / 10, unit: "h", recordedById: U("PRODUCTION_MANAGER") } });
  await db.actualConsumption.create({ data: { projectId: cai.id, resourceType: "VEHICLE", category: "VEHICLE:TRIPS", description: "Vehicles used (outbound)", plannedQuantity: plan.logistics.trips.length, actualQuantity: plan.logistics.trips.length, unit: "vehicles", recordedById: U("LOGISTICS_MANAGER") } });
  await db.costItem.create({ data: { projectId: cai.id, category: "MATERIALS", description: "MDF-18 invoice (actual, demo)", quantity: 16, unit: "sheet", unitCost: 1480, amount: 23680, currency: "EGP", basis: "ACTUAL" } });

  // ═════════════ Aswan plan generation (under review) ═════════════
  console.log("▶ Generating Aswan plan…");
  await generatePlan(ctx, A, { asOf: d(D.ASWAN_DATES.asOf), label: "Initial integrated plan" });
  // a pending procurement approval and an RFQ in progress
  const ply = await db.procurementRequest.findFirst({ where: { projectId: A, code: "MAT:PLY-18" } });
  if (ply) {
    await db.procurementRequest.update({ where: { id: ply.id }, data: { status: "PENDING_APPROVAL" } });
    await db.vendorQuote.create({ data: { vendorId: vendors.get("V-TIMBER")!, projectId: A, procurementRequestId: ply.id, item: "Plywood 18 mm", quantity: ply.quantity, unitPrice: 1820, leadTimeDays: 5, validUntil: day("2026-12-01"), status: "RECEIVED" } });
    await db.vendorQuote.create({ data: { vendorId: vendors.get("V-HARDWARE")!, projectId: A, procurementRequestId: ply.id, item: "Plywood 18 mm (alt.)", quantity: ply.quantity, unitPrice: 1905, leadTimeDays: 3, validUntil: day("2026-12-01"), status: "RECEIVED" } });
    await db.approval.create({ data: { companyId: C, projectId: A, entityType: "PROCUREMENT", entityId: ply.id, title: `Purchase request ${ply.code} — ${ply.item}`, description: `${ply.quantity} ${ply.unit} · 2 quotations received`, requiredRole: "FINANCE", requestedById: U("PROCUREMENT_MANAGER") } });
  }
  const rental = await db.procurementRequest.findFirst({ where: { projectId: A, code: { startsWith: "RENT:LED" } } });
  if (rental) await db.procurementRequest.update({ where: { id: rental.id }, data: { status: "RFQ_PREPARED", vendorId: vendors.get("V-AVRENT") } });
  await db.approval.create({ data: { companyId: C, entityType: "STANDARD", entityId: (await db.companyStandard.findFirstOrThrow({ where: { companyId: C, key: "PROPOSAL:CARPENTER:INSTALLATION" } })).id, title: "Standards change proposal: carpenter installation productivity 0.35 → 0.40 h/m²", description: "Proposed from DEMO-CAI-2611 actuals. Only a Super Admin may approve.", requiredRole: "SUPER_ADMIN" } });

  await db.notification.create({ data: { companyId: C, userId: U("PROJECT_MANAGER"), projectId: cai.id, type: "DELAY", title: "Line-array installation delayed 2 h — Cairo Product Launch", link: `/execution?project=${cai.id}` } });
  await db.notification.create({ data: { companyId: C, userId: U("FINANCE"), projectId: A, type: "APPROVAL", title: "Purchase request MAT:PLY-18 awaiting your approval", link: "/approvals" } });

  const counts = { users: await db.user.count(), projects: await db.project.count(), tasks: await db.task.count(), calcs: await db.calculationRecord.count(), risks: await db.risk.count(), approvals: await db.approval.count({ where: { status: "PENDING" } }) };
  console.log("✔ Seed complete", counts);
  console.log(`\nDevelopment demo accounts (password: ${DEMO_PASSWORD}):\n${userDefs.map((u) => `  ${u.email.padEnd(40)} ${ROLE_LABELS[u.role]}`).join("\n")}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
