/**
 * ProjectSnapshot — the complete, plain-data input to the planning pipeline.
 * Built from the database by server/services/snapshot.ts, or modified in memory for
 * what-if simulations and change-impact analysis. Engines never touch the database.
 */

export interface Standards {
  /** local hour the workshop day starts / ends */
  workshopDayStart: number;
  workshopDayEnd: number;
  /** JS weekday numbers that are working days (Egypt default Sun–Thu + Sat) */
  workshopWorkdays: number[];
  /** default on-site working window when the venue gives none */
  siteDayStart: number;
  siteDayEnd: number;
  defaultWastePct: number;
  contingencyPct: number;
  /** severity thresholds on probability × impact (1..25) */
  riskThresholds: { medium: number; high: number; critical: number };
  /** buffer kept between end of setup and event start, hours */
  setupBufferHours: number;
  /** utilisation cap applied to vehicle payload/volume (stacking losses, securing) */
  vehicleFillFactor: number;
  /** maps planning operations to the labour trade + productivity activity they use */
  activityMap: Record<OperationKey, { laborKey: string; activity: string; unit: "m2" | "m" | "m3" | "piece" | "unit" }>;
  /** default crew size cap per task when headcount allows */
  maxCrewPerTask: number;
  timezoneOffsetHours: number;
  /** fixed-duration site activities (hours) — company standards */
  avTestHours: number;
  rehearsalHours: number;
  finalInspectionHours: number;
  siteHandoverHours: number;
}

export type OperationKey =
  | "PANEL_FABRICATION"
  | "FRAME_ASSEMBLY"
  | "PAINTING"
  | "INSTALLATION"
  | "LOADING"
  | "UNLOADING"
  | "BRANDING_INSTALL"
  | "DISMANTLE";

export const DEFAULT_STANDARDS: Standards = {
  workshopDayStart: 8,
  workshopDayEnd: 17,
  workshopWorkdays: [0, 1, 2, 3, 4, 6],
  siteDayStart: 7,
  siteDayEnd: 23,
  defaultWastePct: 10,
  contingencyPct: 10,
  riskThresholds: { medium: 5, high: 10, critical: 16 },
  setupBufferHours: 2,
  vehicleFillFactor: 0.85,
  activityMap: {
    PANEL_FABRICATION: { laborKey: "CARPENTER", activity: "PANEL_FABRICATION", unit: "m2" },
    FRAME_ASSEMBLY: { laborKey: "CARPENTER", activity: "FRAME_ASSEMBLY", unit: "m" },
    PAINTING: { laborKey: "PAINTER", activity: "PAINTING", unit: "m2" },
    INSTALLATION: { laborKey: "CARPENTER", activity: "INSTALLATION", unit: "m2" },
    LOADING: { laborKey: "LOADER", activity: "LOADING", unit: "m3" },
    UNLOADING: { laborKey: "LOADER", activity: "UNLOADING", unit: "m3" },
    BRANDING_INSTALL: { laborKey: "HELPER", activity: "BRANDING_INSTALL", unit: "m2" },
    DISMANTLE: { laborKey: "HELPER", activity: "DISMANTLE", unit: "m3" },
  },
  maxCrewPerTask: 8,
  timezoneOffsetHours: 2,
  avTestHours: 2,
  rehearsalHours: 2,
  finalInspectionHours: 1,
  siteHandoverHours: 0.5,
};

export interface MaterialSnap {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  stockLengthM: number | null;
  stockWidthM: number | null;
  thicknessMm: number | null;
  weightPerUnitKg: number | null;
  coverageM2PerL: number | null;
  wasteFactorPct: number;
  kerfMm: number | null;
  edgeTrimMm: number | null;
  grainDirection: boolean;
  unitCost: number | null;
  currency: string;
  status: string;
  supplierName: string | null;
  supplierLeadTimeDays: number | null;
  stockQty: number | null;
}

export interface ProductionSpecSnap {
  id: string;
  kind: "PANEL" | "FRAME_MEMBER" | "PAINT_SURFACE" | "ACCESSORY";
  label: string;
  materialId: string | null;
  lengthM: number | null;
  widthM: number | null;
  quantity: number;
  sides: number;
  coats: number | null;
}

export interface ProductionItemSnap {
  id: string;
  code: string;
  name: string;
  category: string;
  quantity: number;
  widthM: number | null;
  heightM: number | null;
  depthM: number | null;
  boardMaterialId: string | null;
  finishing: string | null;
  paintCoats: number | null;
  drawingStatus: "MISSING" | "PROVIDED" | "APPROVED";
  installationDay: number | null;
  packedVolumeM3: number | null;
  packedWeightKg: number | null;
  engineeringApprovalRequired: boolean;
  specs: ProductionSpecSnap[];
}

export interface LaborCategorySnap {
  id: string;
  key: string;
  name: string;
  dailyHours: number;
  breakHours: number;
  maxOvertimeHours: number;
  dailyRate: number | null;
  overtimeHourlyRate: number | null;
  currency: string;
  headcount: number;
  status: string;
  rates: { activity: string; unitOfWork: string; hoursPerUnit: number; status: string }[];
}

export interface EquipmentSnap {
  id: string;
  code: string;
  category: string;
  model: string;
  weightKg: number | null;
  caseVolumeM3: number | null;
  powerW: number | null;
  setupMinutes: number | null;
  techniciansRequired: number | null;
  rentalDailyRate: number | null;
  currency: string;
  ownership: "OWNED" | "RENTAL";
  ownedQty: number;
  outOfService: number;
  allocatedElsewhere: { projectCode: string; start: Date; end: Date; quantity: number }[];
}

export interface EquipmentRequirementSnap {
  id: string;
  category: string;
  description: string;
  equipmentId: string | null;
  quantity: number;
  backupQuantity: number;
}

export interface VehicleSnap {
  id: string;
  code: string;
  type: string;
  payloadKg: number;
  volumeM3: number;
  internalLengthM: number | null;
  internalWidthM: number | null;
  internalHeightM: number | null;
  dailyCost: number | null;
  currency: string;
  available: boolean;
  maintenanceStatus: string;
  bookedElsewhere: { projectCode: string; start: Date; end: Date }[];
}

export interface CargoSnap {
  id: string;
  sourceType: string;
  name: string;
  quantity: number;
  lengthM: number | null;
  widthM: number | null;
  heightM: number | null;
  unitWeightKg: number | null;
  unitVolumeM3: number | null;
  fragile: boolean;
}

export interface RouteSnap { origin: string; destination: string; distanceKm: number | null; durationHours: number | null; approved: boolean; source: string }

export interface AccommodationSnap {
  id: string;
  guestName: string | null;
  personKey: string | null; // userId or employee code — used for overlap detection
  department: string | null;
  jobRole: string | null;
  hotelId: string | null;
  roomTypeId: string | null;
  roomLabel: string | null;
  sharedRoom: boolean;
  checkIn: Date | null;
  checkOut: Date | null;
  bookingStatus: string;
  confirmationRef: string | null;
}

export interface HotelSnap {
  id: string;
  name: string;
  roomTypes: { id: string; name: string; capacity: number; nightlyRate: number | null; currency: string; roomsAvailable: number | null }[];
}

export interface BrandingSnap {
  id: string;
  name: string;
  widthM: number | null;
  heightM: number | null;
  quantity: number | null;
  material: string | null;
  printMethod: string | null;
  leadTimeDays: number | null;
  vendorName: string | null;
  unitCost: number | null;
  currency: string;
  clientApprovalDeadline: Date | null;
  deliveryDeadline: Date | null;
  approvalStatus: string;
}

export interface ManualCostSnap {
  id: string;
  category: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  currency: string;
  basis: "ACTUAL" | "APPROVED_QUOTE" | "ESTIMATE" | "PENDING_QUOTE" | "BUDGET";
}

export interface ProjectSnapshot {
  asOf: Date;
  project: {
    id: string;
    code: string;
    name: string;
    currency: string;
    participants: number;
    eventStart: Date;
    eventEnd: Date;
    setupStart: Date;
    setupEnd: Date;
    dismantleStart: Date | null;
    dismantleEnd: Date | null;
    budgetAmount: number | null;
    location: string;
    originCity: string;
  };
  venue: { name: string; city: string; accessOpens: string | null; accessCloses: string | null; powerCapacityKw: number | null } | null;
  standards: Standards;
  materials: MaterialSnap[];
  productionItems: ProductionItemSnap[];
  laborCategories: LaborCategorySnap[];
  equipment: EquipmentSnap[];
  equipmentRequirements: EquipmentRequirementSnap[];
  vehicles: VehicleSnap[];
  driversAvailable: number;
  extraCargo: CargoSnap[];
  routes: RouteSnap[];
  accommodation: AccommodationSnap[];
  hotels: HotelSnap[];
  branding: BrandingSnap[];
  manualCosts: ManualCostSnap[];
  exchangeRates: { from: string; to: string; rate: number; source: string; rateDate: Date }[];
}
