# Database schema

PostgreSQL 16 via Prisma 6 (`prisma/schema.prisma`, migrations in `prisma/migrations`). ~55 models.

## Conventions
- `id` = cuid; `createdAt`/`updatedAt`; soft delete via `deletedAt` on `User`, `Project`, `UploadedDocument`.
- **Tenancy:** top-level entities carry `companyId` (Company, Role, Department, User, Project, EventVenue, UploadedDocument, MaterialCatalog, Material, LaborCategory, Equipment, Vehicle, Driver, Hotel, Vendor, CompanyStandard, CalculationRecord, Approval, AuditLog, Notification, ExchangeRate, RouteEstimate, HistoricalEvent). Child entities hang off a company-scoped parent (mostly `Project`). Every query is scoped (`projectScope(user)` / `companyId`).
- Money: `Decimal(14,2)` + explicit `currency`. Quantities: `Float` with documented units (m, kg, m³, h).
- Restrictive FKs on departments (cannot delete a department with history); project children cascade.

## Entity map
| Domain | Models |
|---|---|
| Identity & access | Company, User, Role, Permission, RolePermission, Department, DepartmentMembership |
| Projects | Project, ProjectMember, ProjectDepartment, EventVenue, EventRequirement |
| Inputs | DepartmentSubmission, SubmissionField, UploadedDocument, ExtractedDocumentData |
| Production | ProductionItem (+ packedVolumeM3), ProductionSpecification (PANEL / FRAME_MEMBER / PAINT_SURFACE / ACCESSORY), MaterialCatalog, Material, MaterialCalculation, CuttingPlan |
| Labour | LaborCategory, LaborRate (activity productivity), LaborAssignment |
| AV | Equipment, EquipmentInventory, EquipmentRequirement, ResourceAssignment |
| Logistics | Vehicle, Driver, RouteEstimate, VehicleAssignment, CargoItem |
| Accommodation | Hotel, RoomType, AccommodationAssignment |
| Creative | BrandingItem |
| Procurement | Vendor, VendorQuote, ProcurementRequest |
| Planning | Task (planKey, generated, CPM fields), TaskAssignee, TaskDependency (FS/SS/FF/SF + lag), ScheduleVersion (full plan JSON, status DRAFT/UNDER_REVIEW/APPROVED/SUPERSEDED) |
| Risk | Risk (probability, impact, severity, trigger, warning signs, prevention, immediate action, contingency, owner, response time, impacts, generated/ruleKey) |
| Budget | ProjectBudget, CostItem (basis ACTUAL / APPROVED_QUOTE / ESTIMATE / PENDING_QUOTE / BUDGET), ExchangeRate |
| Trust | CalculationRecord, Approval, ProjectChange, AuditLog, CompanyStandard (versioned, status APPROVED/PENDING/DEMO/RETIRED) |
| Execution & learning | ExecutionUpdate, ActualConsumption, ScenarioSimulation, HistoricalEvent, Notification, Comment |

## Enums
ProjectStatus (LEAD … CANCELLED), InputStatus (DRAFT, EXTRACTING, NEEDS_INFORMATION, SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, REVISED), DataState (VERIFIED, CALCULATED, ESTIMATED, NEEDS_INFORMATION, UNDER_REVIEW, APPROVED, REJECTED), plus category/status enums for production, materials, equipment, vehicles, bookings, procurement, tasks, risks, costs, approvals, changes.

## Seed
`npm run db:seed` truncates application tables (dev only; refuses in production unless `ALLOW_DEMO_SEED=true`, and refuses any database that contains non-demo user accounts unless `SEED_FORCE_RESET=true`) and loads 4 connected demo projects: Aswan Corporate Conference (under review), Alexandria Annual Gala (approved, holds 30 LED cabinets → cross-project rental gap), Hurghada Dealer Summit (awaiting inputs), Cairo Product Launch (in execution with actuals).
