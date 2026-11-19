-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('LEAD', 'PLANNING', 'AWAITING_INPUTS', 'UNDER_REVIEW', 'APPROVED', 'IN_PREPARATION', 'IN_EXECUTION', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InputStatus" AS ENUM ('DRAFT', 'EXTRACTING', 'NEEDS_INFORMATION', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'REVISED');

-- CreateEnum
CREATE TYPE "DataState" AS ENUM ('VERIFIED', 'CALCULATED', 'ESTIMATED', 'NEEDS_INFORMATION', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InputMethod" AS ENUM ('FORM', 'AI_CONVERSATION', 'DOCUMENT', 'IMPORT');

-- CreateEnum
CREATE TYPE "StandardStatus" AS ENUM ('APPROVED', 'PENDING', 'DEMO', 'RETIRED');

-- CreateEnum
CREATE TYPE "ProductionCategory" AS ENUM ('STAGE', 'BACKDROP', 'PODIUM', 'BOOTH', 'COUNTER', 'FURNITURE', 'DECORATIVE', 'SIGNAGE', 'CARPENTRY', 'PAINTING', 'BRANDING_INSTALL', 'FLOORING', 'OTHER');

-- CreateEnum
CREATE TYPE "ProductionSpecKind" AS ENUM ('PANEL', 'FRAME_MEMBER', 'PAINT_SURFACE', 'ACCESSORY');

-- CreateEnum
CREATE TYPE "DrawingStatus" AS ENUM ('MISSING', 'PROVIDED', 'APPROVED');

-- CreateEnum
CREATE TYPE "MaterialCategory" AS ENUM ('BOARD', 'TIMBER', 'PAINT', 'PRIMER', 'FASTENER', 'ADHESIVE', 'VINYL', 'FABRIC', 'FLOORING', 'CARPET', 'METAL', 'OTHER');

-- CreateEnum
CREATE TYPE "EquipmentCategory" AS ENUM ('LED_SCREEN', 'LED_PROCESSOR', 'MEDIA_SERVER', 'PROJECTOR', 'PROJECTION_SCREEN', 'SPEAKER', 'SOUND_SYSTEM', 'MIXING_CONSOLE', 'MICROPHONE', 'LIGHTING_FIXTURE', 'LIGHTING_CONSOLE', 'TRUSS', 'RIGGING', 'INTERPRETATION', 'HEADSET', 'CAMERA', 'RECORDING', 'NETWORK', 'CABLE', 'POWER_DISTRIBUTION', 'OTHER');

-- CreateEnum
CREATE TYPE "Ownership" AS ENUM ('OWNED', 'RENTAL');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('PICKUP', 'VAN', 'MINIBUS', 'MEDIUM_TRUCK', 'LARGE_TRUCK', 'TRAILER', 'OTHER');

-- CreateEnum
CREATE TYPE "TripDirection" AS ENUM ('OUTBOUND', 'RETURN');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('REQUESTED', 'QUOTED', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProcurementStatus" AS ENUM ('DRAFT', 'RFQ_PREPARED', 'QUOTED', 'PENDING_APPROVAL', 'APPROVED', 'ORDERED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'DELAYED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskPhase" AS ENUM ('ADMIN', 'PROCUREMENT', 'PRODUCTION', 'TRANSPORT', 'SETUP', 'EVENT', 'DISMANTLE');

-- CreateEnum
CREATE TYPE "DependencyType" AS ENUM ('FS', 'SS', 'FF', 'SF');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "RiskStatus" AS ENUM ('IDENTIFIED', 'MONITORING', 'MITIGATED', 'TRIGGERED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CostCategory" AS ENUM ('MATERIALS', 'LABOR', 'AV_EQUIPMENT', 'RENTALS', 'TRANSPORTATION', 'ACCOMMODATION', 'VENDORS', 'PRINTING', 'OPERATIONS', 'CONTINGENCY');

-- CreateEnum
CREATE TYPE "CostBasis" AS ENUM ('ACTUAL', 'APPROVED_QUOTE', 'ESTIMATE', 'PENDING_QUOTE', 'BUDGET');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "ChangeStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED', 'APPLIED');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('MATERIAL', 'LABOR', 'EQUIPMENT', 'VEHICLE', 'COST');

-- CreateEnum
CREATE TYPE "ExecutionUpdateType" AS ENUM ('STATUS', 'ISSUE', 'DELAY', 'PHOTO', 'INSPECTION', 'REQUIREMENT');

-- CreateEnum
CREATE TYPE "ExtractionMethod" AS ENUM ('RULE_BASED', 'AI', 'MANUAL');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'EG',
    "defaultCurrency" TEXT NOT NULL DEFAULT 'EGP',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Cairo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "jobTitle" TEXT,
    "phone" TEXT,
    "employeeCode" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "sessionVersion" INTEGER NOT NULL DEFAULT 1,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentMembership" (
    "userId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "isManager" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DepartmentMembership_pkey" PRIMARY KEY ("userId","departmentId")
);

-- CreateTable
CREATE TABLE "EventVenue" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT,
    "accessOpens" TEXT,
    "accessCloses" TEXT,
    "powerCapacityKw" DOUBLE PRECISION,
    "loadingDock" BOOLEAN NOT NULL DEFAULT false,
    "maxVehicleType" "VehicleType",
    "accessNotes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventVenue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "venueId" TEXT,
    "eventStart" TIMESTAMP(3) NOT NULL,
    "eventEnd" TIMESTAMP(3) NOT NULL,
    "setupStart" TIMESTAMP(3) NOT NULL,
    "setupEnd" TIMESTAMP(3) NOT NULL,
    "dismantleStart" TIMESTAMP(3),
    "dismantleEnd" TIMESTAMP(3),
    "participants" INTEGER NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNING',
    "budgetAmount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "description" TEXT,
    "ownerId" TEXT,
    "projectManagerId" TEXT,
    "accountManagerId" TEXT,
    "planVersion" INTEGER NOT NULL DEFAULT 0,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateTable
CREATE TABLE "ProjectDepartment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "leadId" TEXT,
    "status" "InputStatus" NOT NULL DEFAULT 'DRAFT',
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "ProjectDepartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRequirement" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "status" "InputStatus" NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentSubmission" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "reviewerId" TEXT,
    "title" TEXT NOT NULL,
    "method" "InputMethod" NOT NULL DEFAULT 'FORM',
    "status" "InputStatus" NOT NULL DEFAULT 'DRAFT',
    "rawText" TEXT,
    "extracted" JSONB,
    "missingFields" JSONB,
    "formStep" INTEGER NOT NULL DEFAULT 1,
    "reviewNote" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionField" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT,
    "unit" TEXT,
    "state" "DataState" NOT NULL DEFAULT 'ESTIMATED',
    "method" "ExtractionMethod" NOT NULL DEFAULT 'MANUAL',
    "isAssumption" BOOLEAN NOT NULL DEFAULT false,
    "sourceDocumentId" TEXT,
    "sourcePage" INTEGER,
    "sourceSnippet" TEXT,

    CONSTRAINT "SubmissionField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadedDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "submissionId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "status" "InputStatus" NOT NULL DEFAULT 'SUBMITTED',
    "textPreview" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "UploadedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractedDocumentData" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "page" INTEGER,
    "field" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "unit" TEXT,
    "snippet" TEXT,
    "method" "ExtractionMethod" NOT NULL,
    "state" "DataState" NOT NULL DEFAULT 'UNDER_REVIEW',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractedDocumentData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "submissionId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ProductionCategory" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "widthM" DOUBLE PRECISION,
    "heightM" DOUBLE PRECISION,
    "depthM" DOUBLE PRECISION,
    "boardMaterialId" TEXT,
    "finishing" TEXT,
    "color" TEXT,
    "paintCoats" INTEGER,
    "constructionMethod" TEXT,
    "installationMethod" TEXT,
    "installationDay" INTEGER,
    "installHoursEst" DOUBLE PRECISION,
    "specialTools" TEXT,
    "notes" TEXT,
    "drawingStatus" "DrawingStatus" NOT NULL DEFAULT 'MISSING',
    "state" "DataState" NOT NULL DEFAULT 'NEEDS_INFORMATION',
    "engineeringApprovalRequired" BOOLEAN NOT NULL DEFAULT false,
    "engineeringApprovedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionSpecification" (
    "id" TEXT NOT NULL,
    "productionItemId" TEXT NOT NULL,
    "kind" "ProductionSpecKind" NOT NULL,
    "label" TEXT NOT NULL,
    "materialId" TEXT,
    "lengthM" DOUBLE PRECISION,
    "widthM" DOUBLE PRECISION,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "sides" INTEGER NOT NULL DEFAULT 1,
    "coats" INTEGER,
    "drawingRef" TEXT,
    "notes" TEXT,

    CONSTRAINT "ProductionSpecification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialCatalog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "MaterialCategory" NOT NULL,

    CONSTRAINT "MaterialCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "catalogId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "MaterialCategory" NOT NULL,
    "unit" TEXT NOT NULL,
    "stockLengthM" DOUBLE PRECISION,
    "stockWidthM" DOUBLE PRECISION,
    "thicknessMm" DOUBLE PRECISION,
    "weightPerUnitKg" DOUBLE PRECISION,
    "coverageM2PerL" DOUBLE PRECISION,
    "wasteFactorPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "kerfMm" DOUBLE PRECISION,
    "edgeTrimMm" DOUBLE PRECISION,
    "grainDirection" BOOLEAN NOT NULL DEFAULT false,
    "unitCost" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "supplierId" TEXT,
    "stockQty" DOUBLE PRECISION,
    "status" "StandardStatus" NOT NULL DEFAULT 'DEMO',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialCalculation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "productionItemId" TEXT,
    "materialId" TEXT NOT NULL,
    "netQuantity" DOUBLE PRECISION NOT NULL,
    "wastePct" DOUBLE PRECISION NOT NULL,
    "grossQuantity" DOUBLE PRECISION NOT NULL,
    "purchaseQuantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "state" "DataState" NOT NULL DEFAULT 'CALCULATED',
    "calculationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CuttingPlan" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "boardsUsed" INTEGER NOT NULL,
    "utilizationPct" DOUBLE PRECISION NOT NULL,
    "kerfMm" DOUBLE PRECISION NOT NULL,
    "layout" JSONB NOT NULL,
    "unplaced" JSONB,
    "calculationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CuttingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaborCategory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "dailyHours" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "breakHours" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "maxOvertimeHours" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "dailyRate" DECIMAL(14,2),
    "overtimeHourlyRate" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "headcountAvailable" INTEGER NOT NULL DEFAULT 0,
    "skillLevel" TEXT,
    "location" TEXT,
    "teamLeader" TEXT,
    "status" "StandardStatus" NOT NULL DEFAULT 'DEMO',

    CONSTRAINT "LaborCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaborRate" (
    "id" TEXT NOT NULL,
    "laborCategoryId" TEXT NOT NULL,
    "activity" TEXT NOT NULL,
    "unitOfWork" TEXT NOT NULL,
    "hoursPerUnit" DOUBLE PRECISION NOT NULL,
    "status" "StandardStatus" NOT NULL DEFAULT 'DEMO',
    "source" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "LaborRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaborAssignment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT,
    "laborCategoryId" TEXT NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "crewSize" INTEGER NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "overtimeHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',

    CONSTRAINT "LaborAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" "EquipmentCategory" NOT NULL,
    "model" TEXT NOT NULL,
    "manufacturer" TEXT,
    "specs" JSONB,
    "widthM" DOUBLE PRECISION,
    "heightM" DOUBLE PRECISION,
    "depthM" DOUBLE PRECISION,
    "weightKg" DOUBLE PRECISION,
    "caseVolumeM3" DOUBLE PRECISION,
    "powerW" DOUBLE PRECISION,
    "connectionType" TEXT,
    "setupMinutes" DOUBLE PRECISION,
    "techniciansRequired" DOUBLE PRECISION,
    "rentalDailyRate" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "ownership" "Ownership" NOT NULL DEFAULT 'OWNED',
    "status" "StandardStatus" NOT NULL DEFAULT 'DEMO',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentInventory" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "outOfService" INTEGER NOT NULL DEFAULT 0,
    "condition" TEXT,

    CONSTRAINT "EquipmentInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentRequirement" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "submissionId" TEXT,
    "equipmentId" TEXT,
    "category" "EquipmentCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "backupQuantity" INTEGER NOT NULL DEFAULT 0,
    "specs" TEXT,
    "allocatedQty" INTEGER NOT NULL DEFAULT 0,
    "rentalQty" INTEGER NOT NULL DEFAULT 0,
    "state" "DataState" NOT NULL DEFAULT 'NEEDS_INFORMATION',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceAssignment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "resourceType" "ResourceType" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "taskId" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',

    CONSTRAINT "ResourceAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL,
    "description" TEXT,
    "payloadKg" DOUBLE PRECISION NOT NULL,
    "volumeM3" DOUBLE PRECISION NOT NULL,
    "internalLengthM" DOUBLE PRECISION,
    "internalWidthM" DOUBLE PRECISION,
    "internalHeightM" DOUBLE PRECISION,
    "dailyCost" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "ownership" "Ownership" NOT NULL DEFAULT 'OWNED',
    "location" TEXT,
    "maintenanceStatus" TEXT NOT NULL DEFAULT 'OK',
    "available" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "licenseType" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteEstimate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "distanceKm" DOUBLE PRECISION,
    "durationHours" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouteEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleAssignment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "driverId" TEXT,
    "tripLabel" TEXT NOT NULL,
    "direction" "TripDirection" NOT NULL DEFAULT 'OUTBOUND',
    "departureAt" TIMESTAMP(3),
    "arrivalAt" TIMESTAMP(3),
    "loadedWeightKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "loadedVolumeM3" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isBackup" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "calculationId" TEXT,

    CONSTRAINT "VehicleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CargoItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "lengthM" DOUBLE PRECISION,
    "widthM" DOUBLE PRECISION,
    "heightM" DOUBLE PRECISION,
    "unitWeightKg" DOUBLE PRECISION,
    "unitVolumeM3" DOUBLE PRECISION,
    "fragile" BOOLEAN NOT NULL DEFAULT false,
    "stackable" BOOLEAN NOT NULL DEFAULT true,
    "handlingNotes" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "destination" TEXT,
    "loadMinutes" DOUBLE PRECISION,
    "unloadMinutes" DOUBLE PRECISION,
    "vehicleAssignmentId" TEXT,
    "state" "DataState" NOT NULL DEFAULT 'ESTIMATED',

    CONSTRAINT "CargoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hotel" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT,
    "stars" INTEGER,
    "contact" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Hotel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomType" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "nightlyRate" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "roomsAvailable" INTEGER,

    CONSTRAINT "RoomType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccommodationAssignment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT,
    "guestName" TEXT,
    "employeeCode" TEXT,
    "departmentId" TEXT,
    "jobRole" TEXT,
    "hotelId" TEXT,
    "roomTypeId" TEXT,
    "roomLabel" TEXT,
    "sharedRoom" BOOLEAN NOT NULL DEFAULT false,
    "arrivalDate" TIMESTAMP(3),
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "specialRequests" TEXT,
    "bookingStatus" "BookingStatus" NOT NULL DEFAULT 'REQUESTED',
    "confirmationRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccommodationAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandingItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "artworkDocumentId" TEXT,
    "widthM" DOUBLE PRECISION,
    "heightM" DOUBLE PRECISION,
    "quantity" INTEGER,
    "material" TEXT,
    "printMethod" TEXT,
    "finishing" TEXT,
    "installationMethod" TEXT,
    "vendorId" TEXT,
    "leadTimeDays" INTEGER,
    "clientApprovalDeadline" TIMESTAMP(3),
    "productionDeadline" TIMESTAMP(3),
    "deliveryDeadline" TIMESTAMP(3),
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "unitCost" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "state" "DataState" NOT NULL DEFAULT 'NEEDS_INFORMATION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "location" TEXT,
    "services" TEXT[],
    "leadTimeDays" INTEGER,
    "status" "StandardStatus" NOT NULL DEFAULT 'DEMO',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorQuote" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "projectId" TEXT,
    "procurementRequestId" TEXT,
    "item" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "taxPct" DOUBLE PRECISION NOT NULL DEFAULT 14,
    "leadTimeDays" INTEGER,
    "validUntil" TIMESTAMP(3),
    "quotedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "documentId" TEXT,

    CONSTRAINT "VendorQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "departmentId" TEXT,
    "code" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "materialId" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "specifications" TEXT,
    "requiredByDate" TIMESTAMP(3),
    "vendorId" TEXT,
    "unitPrice" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "taxPct" DOUBLE PRECISION NOT NULL DEFAULT 14,
    "status" "ProcurementStatus" NOT NULL DEFAULT 'DRAFT',
    "receivedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "calculationId" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcurementRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "departmentId" TEXT,
    "wbsCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "phase" "TaskPhase" NOT NULL,
    "assignedTeam" TEXT,
    "laborCategoryId" TEXT,
    "crewSize" INTEGER,
    "laborHours" DOUBLE PRECISION,
    "durationHours" DOUBLE PRECISION NOT NULL,
    "plannedStart" TIMESTAMP(3),
    "plannedEnd" TIMESTAMP(3),
    "earlyStartH" DOUBLE PRECISION,
    "lateStartH" DOUBLE PRECISION,
    "totalFloatH" DOUBLE PRECISION,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "isMilestone" BOOLEAN NOT NULL DEFAULT false,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "location" TEXT,
    "deadline" TIMESTAMP(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "percentComplete" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "generated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAssignee" (
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TaskAssignee_pkey" PRIMARY KEY ("taskId","userId")
);

-- CreateTable
CREATE TABLE "TaskDependency" (
    "id" TEXT NOT NULL,
    "predecessorId" TEXT NOT NULL,
    "successorId" TEXT NOT NULL,
    "type" "DependencyType" NOT NULL DEFAULT 'FS',
    "lagHours" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "method" TEXT NOT NULL,
    "makespanHours" DOUBLE PRECISION,
    "feasible" BOOLEAN NOT NULL DEFAULT true,
    "snapshot" JSONB NOT NULL,
    "conflicts" JSONB,
    "criticalPath" JSONB,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Risk" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "departmentId" TEXT,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "probability" INTEGER NOT NULL,
    "impact" INTEGER NOT NULL,
    "severity" INTEGER NOT NULL,
    "ownerId" TEXT,
    "trigger" TEXT,
    "warningSigns" TEXT,
    "prevention" TEXT,
    "immediateAction" TEXT,
    "contingency" TEXT,
    "responseTimeMin" INTEGER,
    "requiredResources" TEXT,
    "timeImpactHours" DOUBLE PRECISION,
    "costImpact" DECIMAL(14,2),
    "costCurrency" TEXT,
    "status" "RiskStatus" NOT NULL DEFAULT 'IDENTIFIED',
    "generated" BOOLEAN NOT NULL DEFAULT false,
    "ruleKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Risk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fromCurrency" TEXT NOT NULL,
    "toCurrency" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "rateDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectBudget" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "totalBudget" DECIMAL(14,2) NOT NULL,
    "contingencyPct" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "budgetId" TEXT,
    "category" "CostCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "basis" "CostBasis" NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "generated" BOOLEAN NOT NULL DEFAULT false,
    "calculationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalculationRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "engine" TEXT NOT NULL,
    "subjectType" TEXT,
    "subjectId" TEXT,
    "title" TEXT NOT NULL,
    "formula" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,
    "outputs" JSONB NOT NULL,
    "assumptions" JSONB,
    "units" TEXT,
    "engineVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "state" "DataState" NOT NULL DEFAULT 'CALCULATED',
    "createdById" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalculationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "requiredRole" TEXT NOT NULL,
    "requestedById" TEXT,
    "approverId" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectChange" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "changes" JSONB NOT NULL,
    "impact" JSONB,
    "status" "ChangeStatus" NOT NULL DEFAULT 'PROPOSED',
    "requestedById" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "ProjectChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "projectId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL DEFAULT 'PROJECT',
    "entityId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActualConsumption" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT,
    "resourceType" "ResourceType" NOT NULL,
    "materialId" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "plannedQuantity" DOUBLE PRECISION,
    "actualQuantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "recordedById" TEXT,
    "note" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActualConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionUpdate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT,
    "userId" TEXT NOT NULL,
    "type" "ExecutionUpdateType" NOT NULL,
    "status" "TaskStatus",
    "message" TEXT NOT NULL,
    "percentComplete" DOUBLE PRECISION,
    "delayMinutes" INTEGER,
    "delayReason" TEXT,
    "photoDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutionUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioSimulation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "question" TEXT,
    "assumptions" JSONB NOT NULL,
    "result" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScenarioSimulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyStandard" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "unit" TEXT,
    "description" TEXT,
    "status" "StandardStatus" NOT NULL DEFAULT 'DEMO',
    "version" INTEGER NOT NULL DEFAULT 1,
    "proposedBy" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyStandard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricalEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3),
    "location" TEXT,
    "participants" INTEGER,
    "metrics" JSONB NOT NULL,
    "lessonsLearned" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Role_companyId_key_key" ON "Role"("companyId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Department_companyId_key_key" ON "Department"("companyId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- CreateIndex
CREATE INDEX "EventVenue_companyId_idx" ON "EventVenue"("companyId");

-- CreateIndex
CREATE INDEX "Project_companyId_status_idx" ON "Project"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Project_companyId_code_key" ON "Project"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectDepartment_projectId_departmentId_key" ON "ProjectDepartment"("projectId", "departmentId");

-- CreateIndex
CREATE INDEX "EventRequirement_projectId_idx" ON "EventRequirement"("projectId");

-- CreateIndex
CREATE INDEX "DepartmentSubmission_projectId_departmentId_idx" ON "DepartmentSubmission"("projectId", "departmentId");

-- CreateIndex
CREATE INDEX "DepartmentSubmission_status_idx" ON "DepartmentSubmission"("status");

-- CreateIndex
CREATE INDEX "SubmissionField_submissionId_idx" ON "SubmissionField"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "UploadedDocument_storageKey_key" ON "UploadedDocument"("storageKey");

-- CreateIndex
CREATE INDEX "UploadedDocument_companyId_projectId_idx" ON "UploadedDocument"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "ExtractedDocumentData_documentId_idx" ON "ExtractedDocumentData"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionItem_projectId_code_key" ON "ProductionItem"("projectId", "code");

-- CreateIndex
CREATE INDEX "ProductionSpecification_productionItemId_idx" ON "ProductionSpecification"("productionItemId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialCatalog_companyId_name_key" ON "MaterialCatalog"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Material_companyId_code_key" ON "Material"("companyId", "code");

-- CreateIndex
CREATE INDEX "MaterialCalculation_projectId_idx" ON "MaterialCalculation"("projectId");

-- CreateIndex
CREATE INDEX "CuttingPlan_projectId_idx" ON "CuttingPlan"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "LaborCategory_companyId_key_key" ON "LaborCategory"("companyId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "LaborRate_laborCategoryId_activity_key" ON "LaborRate"("laborCategoryId", "activity");

-- CreateIndex
CREATE INDEX "LaborAssignment_projectId_idx" ON "LaborAssignment"("projectId");

-- CreateIndex
CREATE INDEX "LaborAssignment_laborCategoryId_workDate_idx" ON "LaborAssignment"("laborCategoryId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_companyId_code_key" ON "Equipment"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentInventory_equipmentId_location_key" ON "EquipmentInventory"("equipmentId", "location");

-- CreateIndex
CREATE INDEX "EquipmentRequirement_projectId_idx" ON "EquipmentRequirement"("projectId");

-- CreateIndex
CREATE INDEX "ResourceAssignment_resourceType_resourceId_startAt_idx" ON "ResourceAssignment"("resourceType", "resourceId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_companyId_code_key" ON "Vehicle"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "RouteEstimate_companyId_origin_destination_key" ON "RouteEstimate"("companyId", "origin", "destination");

-- CreateIndex
CREATE INDEX "VehicleAssignment_projectId_idx" ON "VehicleAssignment"("projectId");

-- CreateIndex
CREATE INDEX "CargoItem_projectId_idx" ON "CargoItem"("projectId");

-- CreateIndex
CREATE INDEX "AccommodationAssignment_projectId_idx" ON "AccommodationAssignment"("projectId");

-- CreateIndex
CREATE INDEX "BrandingItem_projectId_idx" ON "BrandingItem"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementRequest_projectId_code_key" ON "ProcurementRequest"("projectId", "code");

-- CreateIndex
CREATE INDEX "Task_projectId_status_idx" ON "Task"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Task_projectId_wbsCode_key" ON "Task"("projectId", "wbsCode");

-- CreateIndex
CREATE UNIQUE INDEX "TaskDependency_predecessorId_successorId_key" ON "TaskDependency"("predecessorId", "successorId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleVersion_projectId_version_key" ON "ScheduleVersion"("projectId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Risk_projectId_code_key" ON "Risk"("projectId", "code");

-- CreateIndex
CREATE INDEX "ExchangeRate_companyId_fromCurrency_toCurrency_idx" ON "ExchangeRate"("companyId", "fromCurrency", "toCurrency");

-- CreateIndex
CREATE INDEX "CostItem_projectId_category_idx" ON "CostItem"("projectId", "category");

-- CreateIndex
CREATE INDEX "CalculationRecord_projectId_engine_idx" ON "CalculationRecord"("projectId", "engine");

-- CreateIndex
CREATE INDEX "Approval_companyId_status_idx" ON "Approval"("companyId", "status");

-- CreateIndex
CREATE INDEX "Approval_entityType_entityId_idx" ON "Approval"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ProjectChange_projectId_idx" ON "ProjectChange"("projectId");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_projectId_createdAt_idx" ON "AuditLog"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_projectId_idx" ON "Comment"("projectId");

-- CreateIndex
CREATE INDEX "ActualConsumption_projectId_idx" ON "ActualConsumption"("projectId");

-- CreateIndex
CREATE INDEX "ExecutionUpdate_projectId_createdAt_idx" ON "ExecutionUpdate"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "ScenarioSimulation_projectId_idx" ON "ScenarioSimulation"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyStandard_companyId_key_version_key" ON "CompanyStandard"("companyId", "key", "version");

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentMembership" ADD CONSTRAINT "DepartmentMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentMembership" ADD CONSTRAINT "DepartmentMembership_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventVenue" ADD CONSTRAINT "EventVenue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "EventVenue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_projectManagerId_fkey" FOREIGN KEY ("projectManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_accountManagerId_fkey" FOREIGN KEY ("accountManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDepartment" ADD CONSTRAINT "ProjectDepartment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDepartment" ADD CONSTRAINT "ProjectDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDepartment" ADD CONSTRAINT "ProjectDepartment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRequirement" ADD CONSTRAINT "EventRequirement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentSubmission" ADD CONSTRAINT "DepartmentSubmission_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentSubmission" ADD CONSTRAINT "DepartmentSubmission_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentSubmission" ADD CONSTRAINT "DepartmentSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentSubmission" ADD CONSTRAINT "DepartmentSubmission_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionField" ADD CONSTRAINT "SubmissionField_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "DepartmentSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedDocument" ADD CONSTRAINT "UploadedDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedDocument" ADD CONSTRAINT "UploadedDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedDocument" ADD CONSTRAINT "UploadedDocument_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "DepartmentSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedDocument" ADD CONSTRAINT "UploadedDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedDocumentData" ADD CONSTRAINT "ExtractedDocumentData_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "UploadedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionItem" ADD CONSTRAINT "ProductionItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionItem" ADD CONSTRAINT "ProductionItem_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "DepartmentSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionItem" ADD CONSTRAINT "ProductionItem_boardMaterialId_fkey" FOREIGN KEY ("boardMaterialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionSpecification" ADD CONSTRAINT "ProductionSpecification_productionItemId_fkey" FOREIGN KEY ("productionItemId") REFERENCES "ProductionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionSpecification" ADD CONSTRAINT "ProductionSpecification_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialCatalog" ADD CONSTRAINT "MaterialCatalog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "MaterialCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialCalculation" ADD CONSTRAINT "MaterialCalculation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialCalculation" ADD CONSTRAINT "MaterialCalculation_productionItemId_fkey" FOREIGN KEY ("productionItemId") REFERENCES "ProductionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialCalculation" ADD CONSTRAINT "MaterialCalculation_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialCalculation" ADD CONSTRAINT "MaterialCalculation_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "CalculationRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuttingPlan" ADD CONSTRAINT "CuttingPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuttingPlan" ADD CONSTRAINT "CuttingPlan_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuttingPlan" ADD CONSTRAINT "CuttingPlan_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "CalculationRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborCategory" ADD CONSTRAINT "LaborCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborRate" ADD CONSTRAINT "LaborRate_laborCategoryId_fkey" FOREIGN KEY ("laborCategoryId") REFERENCES "LaborCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborAssignment" ADD CONSTRAINT "LaborAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborAssignment" ADD CONSTRAINT "LaborAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborAssignment" ADD CONSTRAINT "LaborAssignment_laborCategoryId_fkey" FOREIGN KEY ("laborCategoryId") REFERENCES "LaborCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentInventory" ADD CONSTRAINT "EquipmentInventory_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentRequirement" ADD CONSTRAINT "EquipmentRequirement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentRequirement" ADD CONSTRAINT "EquipmentRequirement_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "DepartmentSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentRequirement" ADD CONSTRAINT "EquipmentRequirement_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAssignment" ADD CONSTRAINT "ResourceAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteEstimate" ADD CONSTRAINT "RouteEstimate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleAssignment" ADD CONSTRAINT "VehicleAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleAssignment" ADD CONSTRAINT "VehicleAssignment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleAssignment" ADD CONSTRAINT "VehicleAssignment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargoItem" ADD CONSTRAINT "CargoItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargoItem" ADD CONSTRAINT "CargoItem_vehicleAssignmentId_fkey" FOREIGN KEY ("vehicleAssignmentId") REFERENCES "VehicleAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hotel" ADD CONSTRAINT "Hotel_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomType" ADD CONSTRAINT "RoomType_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationAssignment" ADD CONSTRAINT "AccommodationAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationAssignment" ADD CONSTRAINT "AccommodationAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationAssignment" ADD CONSTRAINT "AccommodationAssignment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationAssignment" ADD CONSTRAINT "AccommodationAssignment_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationAssignment" ADD CONSTRAINT "AccommodationAssignment_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandingItem" ADD CONSTRAINT "BrandingItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandingItem" ADD CONSTRAINT "BrandingItem_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorQuote" ADD CONSTRAINT "VendorQuote_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorQuote" ADD CONSTRAINT "VendorQuote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorQuote" ADD CONSTRAINT "VendorQuote_procurementRequestId_fkey" FOREIGN KEY ("procurementRequestId") REFERENCES "ProcurementRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementRequest" ADD CONSTRAINT "ProcurementRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementRequest" ADD CONSTRAINT "ProcurementRequest_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementRequest" ADD CONSTRAINT "ProcurementRequest_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementRequest" ADD CONSTRAINT "ProcurementRequest_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_laborCategoryId_fkey" FOREIGN KEY ("laborCategoryId") REFERENCES "LaborCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleVersion" ADD CONSTRAINT "ScheduleVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBudget" ADD CONSTRAINT "ProjectBudget_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostItem" ADD CONSTRAINT "CostItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostItem" ADD CONSTRAINT "CostItem_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "ProjectBudget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalculationRecord" ADD CONSTRAINT "CalculationRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalculationRecord" ADD CONSTRAINT "CalculationRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectChange" ADD CONSTRAINT "ProjectChange_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActualConsumption" ADD CONSTRAINT "ActualConsumption_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActualConsumption" ADD CONSTRAINT "ActualConsumption_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActualConsumption" ADD CONSTRAINT "ActualConsumption_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionUpdate" ADD CONSTRAINT "ExecutionUpdate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionUpdate" ADD CONSTRAINT "ExecutionUpdate_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionUpdate" ADD CONSTRAINT "ExecutionUpdate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioSimulation" ADD CONSTRAINT "ScenarioSimulation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyStandard" ADD CONSTRAINT "CompanyStandard_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalEvent" ADD CONSTRAINT "HistoricalEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
