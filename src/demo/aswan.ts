/**
 * ════════════════════════════════════════════════════════════════════════
 *  DEMO DATA — NOT APPROVED PARADIGM COMPANY DATA
 * ════════════════════════════════════════════════════════════════════════
 * Illustrative values used to demonstrate the platform end-to-end (seed + tests).
 * Prices, productivity rates, vehicles, vendors, hotels and routes below are
 * placeholders. They must be replaced by approved Paradigm standards before real use.
 * People are role-based placeholders — no real employee identities.
 */

export const DEMO_LABEL = "DEMO DATA — NOT APPROVED PARADIGM COMPANY DATA";

// all times are Africa/Cairo local (UTC+2) expressed in UTC ISO strings
export const ASWAN_DATES = {
  asOf: "2026-11-19T08:00:00Z",
  setupStart: "2026-12-13T05:00:00Z", // 07:00 local
  setupEnd: "2026-12-14T21:00:00Z", // 23:00 local
  eventStart: "2026-12-15T07:00:00Z", // 09:00 local
  eventEnd: "2026-12-16T16:00:00Z", // 18:00 local
  dismantleStart: "2026-12-16T16:00:00Z",
  dismantleEnd: "2026-12-17T10:00:00Z",
};

export const DEMO_VENDORS = [
  { key: "V-TIMBER", name: "Demo Timber & Boards Supplier", location: "Cairo", services: ["Boards", "Timber"], leadTimeDays: 5 },
  { key: "V-PAINT", name: "Demo Paints Trading", location: "Cairo", services: ["Paint", "Primer"], leadTimeDays: 2 },
  { key: "V-HARDWARE", name: "Demo Hardware Store", location: "Cairo", services: ["Fasteners", "Adhesives"], leadTimeDays: 1 },
  { key: "V-PRINT", name: "Demo Print House", location: "Cairo", services: ["Large format print", "Vinyl"], leadTimeDays: 3 },
  { key: "V-AVRENT", name: "Demo AV Rentals", location: "Cairo", services: ["LED rental", "Sound rental"], leadTimeDays: 2 },
  { key: "V-CARPET", name: "Demo Flooring Co.", location: "Cairo", services: ["Carpet", "Flooring"], leadTimeDays: 3 },
];

export const DEMO_MATERIALS = [
  { code: "MDF-18", name: "MDF board 18 mm", category: "BOARD", unit: "sheet", stockLengthM: 2.44, stockWidthM: 1.22, thicknessMm: 18, weightPerUnitKg: 38, kerfMm: 3.2, edgeTrimMm: 5, wasteFactorPct: 5, grainDirection: false, unitCost: 1450, supplier: "V-TIMBER", stockQty: 4 },
  { code: "PLY-18", name: "Plywood 18 mm (deck)", category: "BOARD", unit: "sheet", stockLengthM: 2.44, stockWidthM: 1.22, thicknessMm: 18, weightPerUnitKg: 33, kerfMm: 3.2, edgeTrimMm: 5, wasteFactorPct: 5, grainDirection: true, unitCost: 1850, supplier: "V-TIMBER", stockQty: 0 },
  { code: "TMB-50", name: "Timber batten 50×50 mm × 4.0 m", category: "TIMBER", unit: "stick", stockLengthM: 4.0, weightPerUnitKg: 5.2, kerfMm: 3, wasteFactorPct: 5, unitCost: 210, supplier: "V-TIMBER", stockQty: 20 },
  { code: "PNT-BLK", name: "Black emulsion paint (pail 18L)", category: "PAINT", unit: "pail 18L", coverageM2PerL: 10, wasteFactorPct: 10, unitCost: 2400, supplier: "V-PAINT", stockQty: 0 },
  { code: "PRM-WHT", name: "Wood primer (pail 18L)", category: "PRIMER", unit: "pail 18L", coverageM2PerL: 12, wasteFactorPct: 10, unitCost: 1900, supplier: "V-PAINT", stockQty: 0 },
  { code: "SCR-4x40", name: "Wood screws 4×40 (box of 500)", category: "FASTENER", unit: "box", wasteFactorPct: 10, unitCost: 180, supplier: "V-HARDWARE", stockQty: 2 },
  { code: "CRP-GRY", name: "Exhibition carpet grey", category: "CARPET", unit: "m2", wasteFactorPct: 8, unitCost: 220, supplier: "V-CARPET", stockQty: 0 },
  { code: "VNL-WHT", name: "Self-adhesive vinyl white", category: "VINYL", unit: "m2", wasteFactorPct: 10, unitCost: 160, supplier: "V-PRINT", stockQty: 0 },
] as const;

type SpecDef = { kind: "PANEL" | "FRAME_MEMBER" | "PAINT_SURFACE" | "ACCESSORY"; label: string; material: string | null; lengthM?: number; widthM?: number; quantity: number; sides?: number; coats?: number; drawingRef?: string };

export const DEMO_PRODUCTION_ITEMS: {
  code: string; name: string; category: string; quantity: number; widthM: number | null; heightM: number | null; depthM: number | null;
  board: string | null; finishing: string | null; color: string | null; paintCoats: number | null; constructionMethod: string | null; installationMethod: string | null;
  installationDay: number | null; drawingStatus: "MISSING" | "PROVIDED" | "APPROVED"; engineeringApprovalRequired: boolean; packedVolumeM3: number | null; notes: string | null; specs: SpecDef[];
}[] = [
  {
    code: "STG-01", name: "Main stage 12 × 6 m", category: "STAGE", quantity: 1, widthM: 12, heightM: 0.6, depthM: 6, board: "PLY-18",
    finishing: "Grey carpet deck, black painted fascia", color: "Black / grey", paintCoats: 2, constructionMethod: "Modular timber-framed decks 2.4 × 1.2 m on timber legs",
    installationMethod: "Decks bolted on site, fascia screwed to front", installationDay: 1, drawingStatus: "APPROVED", engineeringApprovalRequired: true, packedVolumeM3: 14, notes: "Load rating to be confirmed by structural engineer.",
    specs: [
      { kind: "PANEL", label: "Deck panel 2.4×1.2", material: "PLY-18", lengthM: 2.4, widthM: 1.2, quantity: 25, drawingRef: "DWG-STG-01 rev B" },
      { kind: "PANEL", label: "Front fascia 2.4×0.6", material: "MDF-18", lengthM: 2.4, widthM: 0.6, quantity: 5, drawingRef: "DWG-STG-01 rev B" },
      { kind: "FRAME_MEMBER", label: "Deck frame long rail 2.4 m", material: "TMB-50", lengthM: 2.4, quantity: 50, drawingRef: "DWG-STG-01 rev B" },
      { kind: "FRAME_MEMBER", label: "Deck frame cross rail 1.1 m", material: "TMB-50", lengthM: 1.1, quantity: 75, drawingRef: "DWG-STG-01 rev B" },
      { kind: "FRAME_MEMBER", label: "Leg 0.55 m", material: "TMB-50", lengthM: 0.55, quantity: 100, drawingRef: "DWG-STG-01 rev B" },
      { kind: "PAINT_SURFACE", label: "Fascia primer", material: "PRM-WHT", lengthM: 12, widthM: 0.6, quantity: 1, sides: 1, coats: 1 },
      { kind: "PAINT_SURFACE", label: "Fascia black paint", material: "PNT-BLK", lengthM: 12, widthM: 0.6, quantity: 1, sides: 1, coats: 2 },
      { kind: "ACCESSORY", label: "Deck carpet", material: "CRP-GRY", quantity: 72 },
      { kind: "ACCESSORY", label: "Screws", material: "SCR-4x40", quantity: 6 },
    ],
  },
  {
    code: "BKD-01", name: "Wooden backdrop 8 × 3 m", category: "BACKDROP", quantity: 1, widthM: 8, heightM: 3, depthM: 0.3, board: "MDF-18",
    finishing: "MDF, primed and painted matte black", color: "Black", paintCoats: 2, constructionMethod: "Timber stud frame clad with MDF panels 2.0 × 1.0 m",
    installationMethod: "Frame assembled on stage, braced to rear; panels screwed", installationDay: 1, drawingStatus: "APPROVED", engineeringApprovalRequired: true, packedVolumeM3: 6, notes: "Installation on first setup day.",
    specs: [
      { kind: "PANEL", label: "Face panel 2.0×1.0", material: "MDF-18", lengthM: 2.0, widthM: 1.0, quantity: 12, drawingRef: "DWG-BKD-01 rev A" },
      { kind: "FRAME_MEMBER", label: "Vertical stud 3.0 m", material: "TMB-50", lengthM: 3.0, quantity: 9, drawingRef: "DWG-BKD-01 rev A" },
      { kind: "FRAME_MEMBER", label: "Horizontal rail 2.0 m", material: "TMB-50", lengthM: 2.0, quantity: 16, drawingRef: "DWG-BKD-01 rev A" },
      { kind: "FRAME_MEMBER", label: "Rear brace 1.5 m", material: "TMB-50", lengthM: 1.5, quantity: 8, drawingRef: "DWG-BKD-01 rev A" },
      { kind: "PAINT_SURFACE", label: "Face primer", material: "PRM-WHT", lengthM: 8, widthM: 3, quantity: 1, sides: 1, coats: 1 },
      { kind: "PAINT_SURFACE", label: "Face black paint", material: "PNT-BLK", lengthM: 8, widthM: 3, quantity: 1, sides: 1, coats: 2 },
      { kind: "ACCESSORY", label: "Screws", material: "SCR-4x40", quantity: 4 },
    ],
  },
  {
    code: "CNT-01", name: "Registration counter", category: "COUNTER", quantity: 2, widthM: 2.4, heightM: 1.0, depthM: 0.6, board: "MDF-18",
    finishing: "White vinyl wrap with client branding", color: "White", paintCoats: null, constructionMethod: "MDF box construction", installationMethod: "Free-standing",
    installationDay: 2, drawingStatus: "PROVIDED", engineeringApprovalRequired: false, packedVolumeM3: null, notes: "Branding wrap supplied by Creative.",
    specs: [
      { kind: "PANEL", label: "Front 2.4×1.0", material: "MDF-18", lengthM: 2.4, widthM: 1.0, quantity: 1 },
      { kind: "PANEL", label: "Top 2.4×0.6", material: "MDF-18", lengthM: 2.4, widthM: 0.6, quantity: 1 },
      { kind: "PANEL", label: "Side 1.0×0.6", material: "MDF-18", lengthM: 1.0, widthM: 0.6, quantity: 2 },
      { kind: "PANEL", label: "Shelf 2.3×0.5", material: "MDF-18", lengthM: 2.3, widthM: 0.5, quantity: 1 },
    ],
  },
  {
    code: "POD-01", name: "Speaker podium", category: "PODIUM", quantity: 1, widthM: 0.6, heightM: 1.1, depthM: 0.5, board: "MDF-18",
    finishing: "Painted white gloss", color: "White", paintCoats: null, constructionMethod: null, installationMethod: null,
    installationDay: 2, drawingStatus: "MISSING", engineeringApprovalRequired: false, packedVolumeM3: 0.35, notes: "Awaiting drawing from Production.", specs: [],
  },
];

export const DEMO_LABOR = [
  { key: "CARPENTER", name: "Carpenter", nameAr: "نجار", headcount: 6, dailyHours: 9, breakHours: 1, maxOvertimeHours: 3, dailyRate: 900, overtimeHourlyRate: 150, rates: [["PANEL_FABRICATION", "m2", 0.8], ["FRAME_ASSEMBLY", "m", 0.12], ["INSTALLATION", "m2", 0.35]] },
  { key: "PAINTER", name: "Painter", nameAr: "نقاش", headcount: 3, dailyHours: 9, breakHours: 1, maxOvertimeHours: 3, dailyRate: 800, overtimeHourlyRate: 130, rates: [["PAINTING", "m2", 0.15]] },
  { key: "LOADER", name: "Loader", nameAr: "عامل تحميل", headcount: 8, dailyHours: 9, breakHours: 1, maxOvertimeHours: 3, dailyRate: 500, overtimeHourlyRate: 80, rates: [["LOADING", "m3", 0.6], ["UNLOADING", "m3", 0.5]] },
  { key: "HELPER", name: "Helper / installer", nameAr: "مساعد فني", headcount: 6, dailyHours: 9, breakHours: 1, maxOvertimeHours: 3, dailyRate: 450, overtimeHourlyRate: 75, rates: [["BRANDING_INSTALL", "m2", 0.3]] }, // DISMANTLE rate intentionally missing → demonstrates NEEDS_INFORMATION
  { key: "AV_TECH", name: "AV technician", nameAr: "فني صوت وصورة", headcount: 5, dailyHours: 10, breakHours: 1, maxOvertimeHours: 3, dailyRate: 1200, overtimeHourlyRate: 200, rates: [] },
  { key: "ELECTRICIAN", name: "Electrician", nameAr: "كهربائي", headcount: 2, dailyHours: 9, breakHours: 1, maxOvertimeHours: 2, dailyRate: 1000, overtimeHourlyRate: 170, rates: [] },
  { key: "RIGGER", name: "Rigger", nameAr: "فني تعليق", headcount: 2, dailyHours: 9, breakHours: 1, maxOvertimeHours: 2, dailyRate: 1100, overtimeHourlyRate: 180, rates: [] },
  { key: "DRIVER", name: "Driver", nameAr: "سائق", headcount: 4, dailyHours: 10, breakHours: 1, maxOvertimeHours: 2, dailyRate: 700, overtimeHourlyRate: 110, rates: [] },
  { key: "SUPERVISOR", name: "Site supervisor", nameAr: "مشرف موقع", headcount: 2, dailyHours: 10, breakHours: 1, maxOvertimeHours: 3, dailyRate: 1500, overtimeHourlyRate: 250, rates: [] },
] as const;

export const DEMO_EQUIPMENT = [
  { code: "LED-P39", category: "LED_SCREEN", model: "LED cabinet P3.9 500×500", manufacturer: "Demo LED", weightKg: 7.5, caseVolumeM3: 0.035, powerW: 180, setupMinutes: 6, techniciansRequired: 2, rentalDailyRate: 350, owned: 96, outOfService: 2 },
  { code: "LED-PROC", category: "LED_PROCESSOR", model: "LED video processor 4K", manufacturer: "Demo LED", weightKg: 6, caseVolumeM3: 0.06, powerW: 150, setupMinutes: 30, techniciansRequired: 1, rentalDailyRate: 1500, owned: 2, outOfService: 0 },
  { code: "SPK-LA", category: "SPEAKER", model: "Line-array speaker element", manufacturer: "Demo Audio", weightKg: 45, caseVolumeM3: 0.25, powerW: 1000, setupMinutes: 20, techniciansRequired: 2, rentalDailyRate: 900, owned: 8, outOfService: 0 },
  { code: "SUB-18", category: "SOUND_SYSTEM", model: "18\" subwoofer", manufacturer: "Demo Audio", weightKg: 60, caseVolumeM3: 0.35, powerW: 1200, setupMinutes: 10, techniciansRequired: 2, rentalDailyRate: 700, owned: 4, outOfService: 0 },
  { code: "MIX-DIG", category: "MIXING_CONSOLE", model: "Digital mixing console 32ch", manufacturer: "Demo Audio", weightKg: 25, caseVolumeM3: 0.3, powerW: 250, setupMinutes: 45, techniciansRequired: 1, rentalDailyRate: 2500, owned: 2, outOfService: 0 },
  { code: "MIC-WL", category: "MICROPHONE", model: "Wireless handheld microphone", manufacturer: "Demo Audio", weightKg: 1.2, caseVolumeM3: 0.004, powerW: 10, setupMinutes: 5, techniciansRequired: 1, rentalDailyRate: 250, owned: 12, outOfService: 1 },
  { code: "LGT-MH", category: "LIGHTING_FIXTURE", model: "Moving head beam/spot", manufacturer: "Demo Light", weightKg: 22, caseVolumeM3: 0.08, powerW: 450, setupMinutes: 15, techniciansRequired: 1, rentalDailyRate: 600, owned: 16, outOfService: 0 },
  { code: "LGT-PAR", category: "LIGHTING_FIXTURE", model: "LED par wash", manufacturer: "Demo Light", weightKg: 4, caseVolumeM3: 0.02, powerW: 180, setupMinutes: 5, techniciansRequired: 1, rentalDailyRate: 150, owned: 40, outOfService: 0 },
  { code: "TRS-3M", category: "TRUSS", model: "Box truss 30 cm × 3 m", manufacturer: "Demo Rigging", weightKg: 18, caseVolumeM3: 0.27, powerW: 0, setupMinutes: 15, techniciansRequired: 2, rentalDailyRate: 200, owned: 30, outOfService: 0 },
  { code: "LGT-CON", category: "LIGHTING_CONSOLE", model: "Lighting console", manufacturer: "Demo Light", weightKg: 20, caseVolumeM3: 0.2, powerW: 200, setupMinutes: 30, techniciansRequired: 1, rentalDailyRate: 1800, owned: 1, outOfService: 0 },
  { code: "PWR-DIS", category: "POWER_DISTRIBUTION", model: "Power distro 63A 3-phase", manufacturer: "Demo Power", weightKg: 35, caseVolumeM3: 0.15, powerW: 0, setupMinutes: 30, techniciansRequired: 1, rentalDailyRate: 800, owned: 3, outOfService: 0 },
  { code: "NET-RTR", category: "NETWORK", model: "Bonded 4G/5G router", manufacturer: "Demo Net", weightKg: 2, caseVolumeM3: 0.01, powerW: 40, setupMinutes: 20, techniciansRequired: 1, rentalDailyRate: 400, owned: 1, outOfService: 0 },
] as const;

export const DEMO_EQUIPMENT_REQUIREMENTS = [
  { equipment: "LED-P39", category: "LED_SCREEN", description: "LED wall 6 × 3.5 m (12 × 7 cabinets)", quantity: 84, backup: 6 },
  { equipment: "LED-PROC", category: "LED_PROCESSOR", description: "LED processor", quantity: 1, backup: 1 },
  { equipment: "TRS-3M", category: "TRUSS", description: "Front lighting truss 12 m (2 × 4 segments)", quantity: 8, backup: 0 },
  { equipment: "PWR-DIS", category: "POWER_DISTRIBUTION", description: "Power distribution", quantity: 2, backup: 0 },
  { equipment: "SPK-LA", category: "SPEAKER", description: "Main PA line array L/R", quantity: 8, backup: 0 },
  { equipment: "SUB-18", category: "SOUND_SYSTEM", description: "Subwoofers", quantity: 4, backup: 0 },
  { equipment: "MIX-DIG", category: "MIXING_CONSOLE", description: "FOH mixing console", quantity: 1, backup: 0 },
  { equipment: "MIC-WL", category: "MICROPHONE", description: "Wireless microphones (panel + Q&A)", quantity: 8, backup: 2 },
  { equipment: "LGT-MH", category: "LIGHTING_FIXTURE", description: "Moving heads on front truss", quantity: 12, backup: 0 },
  { equipment: "LGT-PAR", category: "LIGHTING_FIXTURE", description: "Stage wash pars", quantity: 16, backup: 0 },
  { equipment: "LGT-CON", category: "LIGHTING_CONSOLE", description: "Lighting control", quantity: 1, backup: 0 },
  { equipment: "NET-RTR", category: "NETWORK", description: "Internet backup router", quantity: 1, backup: 0 },
] as const;

/** Another demo project already holds 30 LED cabinets over the same dates → rental gap */
export const DEMO_OTHER_PROJECT_ALLOCATION = { equipment: "LED-P39", quantity: 30, start: "2026-12-12T00:00:00Z", end: "2026-12-16T00:00:00Z", projectCode: "DEMO-ALX-0412" };

export const DEMO_VEHICLES = [
  { code: "TRK-01", type: "LARGE_TRUCK", description: "Large box truck", payloadKg: 10000, volumeM3: 45, L: 9.5, W: 2.4, H: 2.4, dailyCost: 6500, available: true, maintenanceStatus: "OK" },
  { code: "TRK-02", type: "MEDIUM_TRUCK", description: "Medium box truck", payloadKg: 5000, volumeM3: 28, L: 7.0, W: 2.3, H: 2.2, dailyCost: 4500, available: true, maintenanceStatus: "OK" },
  { code: "TRK-03", type: "LARGE_TRUCK", description: "Large box truck", payloadKg: 10000, volumeM3: 45, L: 9.5, W: 2.4, H: 2.4, dailyCost: 6500, available: false, maintenanceStatus: "IN SERVICE" },
  { code: "VAN-01", type: "VAN", description: "Panel van", payloadKg: 1500, volumeM3: 10, L: 3.5, W: 1.8, H: 1.6, dailyCost: 2200, available: true, maintenanceStatus: "OK" },
  { code: "PKP-01", type: "PICKUP", description: "Double-cab pickup", payloadKg: 1000, volumeM3: 3.5, L: 1.6, W: 1.5, H: 0.5, dailyCost: 1200, available: true, maintenanceStatus: "OK" },
] as const;

export const DEMO_ROUTE = { origin: "Cairo", destination: "Aswan", distanceKm: 880, durationHours: 13, approved: false, source: "DEMO estimate — replace with approved Logistics route data" };

export const DEMO_HOTELS = [
  { key: "H1", name: "Demo Nile View Hotel", city: "Aswan", stars: 4, roomTypes: [{ name: "Single", capacity: 1, nightlyRate: 2400, roomsAvailable: 6 }, { name: "Twin", capacity: 2, nightlyRate: 2900, roomsAvailable: 8 }] },
  { key: "H2", name: "Demo Riverside Inn", city: "Aswan", stars: 3, roomTypes: [{ name: "Twin", capacity: 2, nightlyRate: 1800, roomsAvailable: 10 }] },
];

/** role-based placeholder guests (no real identities) */
export const DEMO_ROOMING = [
  { guest: "Demo Project Manager", dept: "PMO", role: "Project Manager", hotel: "H1", room: "Single", label: null, in: "2026-12-12", out: "2026-12-17", status: "CONFIRMED" },
  { guest: "Demo Account Manager", dept: "ACCOUNT", role: "Account Manager", hotel: "H1", room: "Single", label: null, in: "2026-12-14", out: "2026-12-17", status: "CONFIRMED" },
  { guest: "Demo Management Rep", dept: "MANAGEMENT", role: "Management", hotel: "H1", room: "Single", label: null, in: "2026-12-14", out: "2026-12-16", status: "REQUESTED" },
  { guest: "Demo Production Supervisor", dept: "PRODUCTION", role: "Site supervisor", hotel: "H1", room: "Single", label: null, in: "2026-12-12", out: "2026-12-17", status: "CONFIRMED" },
  { guest: "Demo Carpenter 1", dept: "PRODUCTION", role: "Carpenter", hotel: "H2", room: "Twin", label: "P-1", in: "2026-12-12", out: "2026-12-17", status: "CONFIRMED" },
  { guest: "Demo Carpenter 2", dept: "PRODUCTION", role: "Carpenter", hotel: "H2", room: "Twin", label: "P-1", in: "2026-12-12", out: "2026-12-17", status: "CONFIRMED" },
  { guest: "Demo Carpenter 3", dept: "PRODUCTION", role: "Carpenter", hotel: "H2", room: "Twin", label: "P-2", in: "2026-12-12", out: "2026-12-17", status: "CONFIRMED" },
  { guest: "Demo Carpenter 4", dept: "PRODUCTION", role: "Carpenter", hotel: "H2", room: "Twin", label: "P-2", in: "2026-12-12", out: "2026-12-17", status: "CONFIRMED" },
  { guest: "Demo Painter 1", dept: "PRODUCTION", role: "Painter", hotel: "H2", room: "Twin", label: "P-3", in: "2026-12-12", out: "2026-12-17", status: "QUOTED" },
  { guest: "Demo Helper 1", dept: "PRODUCTION", role: "Helper", hotel: "H2", room: "Twin", label: "P-3", in: "2026-12-12", out: "2026-12-17", status: "QUOTED" },
  { guest: "Demo AV Lead Technician", dept: "AV", role: "AV technician", hotel: "H1", room: "Twin", label: "A-1", in: "2026-12-12", out: "2026-12-17", status: "CONFIRMED" },
  { guest: "Demo AV Technician 2", dept: "AV", role: "AV technician", hotel: "H1", room: "Twin", label: "A-1", in: "2026-12-12", out: "2026-12-17", status: "CONFIRMED" },
  { guest: "Demo AV Technician 3", dept: "AV", role: "AV technician", hotel: "H1", room: "Twin", label: "A-2", in: "2026-12-12", out: "2026-12-17", status: "REQUESTED" },
  { guest: "Demo AV Technician 4", dept: "AV", role: "AV technician", hotel: "H1", room: "Twin", label: "A-2", in: "2026-12-12", out: "2026-12-17", status: "REQUESTED" },
  { guest: null, dept: "AV", role: "Rigger (name pending)", hotel: "H2", room: "Twin", label: null, in: "2026-12-12", out: "2026-12-17", status: "REQUESTED" },
] as const;

export const DEMO_BRANDING = [
  { name: "Stage fascia branding 12 × 0.6 m", widthM: 12, heightM: 0.6, quantity: 1, material: "Printed vinyl", printMethod: "Large format solvent", leadTimeDays: 3, unitCost: 2800, approval: "APPROVED", clientApprovalDeadline: "2026-12-01", deliveryDeadline: "2026-12-11" },
  { name: "Roll-up banners 0.85 × 2 m", widthM: 0.85, heightM: 2, quantity: 6, material: "PVC banner + stand", printMethod: "Large format", leadTimeDays: 3, unitCost: 1150, approval: "PENDING", clientApprovalDeadline: "2026-12-03", deliveryDeadline: "2026-12-11" },
  { name: "Registration counter wrap 2.4 × 1.0 m", widthM: 2.4, heightM: 1.0, quantity: 2, material: "Self-adhesive vinyl", printMethod: "Large format + lamination", leadTimeDays: 3, unitCost: 950, approval: "PENDING", clientApprovalDeadline: "2026-12-03", deliveryDeadline: "2026-12-11" },
  { name: "Directional signage", widthM: null, heightM: null, quantity: null, material: "Foam board", printMethod: "UV flatbed", leadTimeDays: 2, unitCost: null, approval: "PENDING", clientApprovalDeadline: "2026-12-05", deliveryDeadline: "2026-12-11" },
] as const;

export const DEMO_EXTRA_CARGO = [
  { name: "Tool boxes & consumables crate", quantity: 2, L: 1.2, W: 0.8, H: 0.8, weight: 120, fragile: false, sourceType: "OTHER" },
  { name: "Printed branding rolls", quantity: 1, L: 1.5, W: 0.5, H: 0.5, weight: 60, fragile: true, sourceType: "PRINT" },
] as const;

export const DEMO_MANUAL_COSTS = [
  { category: "RENTALS", description: "Standby generator 150 kVA (quotation pending)", quantity: 2, unit: "day", unitCost: 9000, currency: "EGP", basis: "PENDING_QUOTE" },
  { category: "OPERATIONS", description: "Site per-diem & local transport (estimate)", quantity: 1, unit: "lump sum", unitCost: 38000, currency: "EGP", basis: "ESTIMATE" },
  { category: "VENDORS", description: "Media server software licence", quantity: 1, unit: "licence", unitCost: 450, currency: "USD", basis: "APPROVED_QUOTE" },
] as const;

export const DEMO_FX = { from: "USD", to: "EGP", rate: 48.5, source: "DEMO rate — replace with Finance-approved rate", rateDate: "2026-11-15" };

export const DEMO_VENUE = { name: "Demo Aswan Conference Hall", city: "Aswan", address: "Corniche, Aswan (demo)", accessOpens: "07:00", accessCloses: "23:00", powerCapacityKw: 120, loadingDock: true };
