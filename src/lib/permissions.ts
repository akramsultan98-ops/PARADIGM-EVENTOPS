/**
 * Role-based permission matrix (spec §26). Mirrored into Role/Permission tables by the seed;
 * the database is authoritative at runtime (loaded with the session).
 * All checks happen on the server — the client only hides controls for convenience.
 */
export const PERMISSIONS = {
  "project.read": "View projects",
  "project.create": "Create projects",
  "project.edit": "Edit project details",
  "project.assign": "Assign departments and team members",
  "submission.create": "Create department inputs",
  "submission.submit": "Submit department inputs for validation",
  "submission.review": "Technically approve / reject department inputs (own department)",
  "plan.generate": "Run the planning engines",
  "plan.review": "Review the integrated plan",
  "plan.approve": "Approve the integrated master plan",
  "schedule.edit": "Modify schedule dates and assignments",
  "budget.read": "View costs and budget",
  "budget.approve": "Approve budgets and cost commitments",
  "procurement.manage": "Manage procurement requests and RFQs",
  "procurement.approve": "Approve purchase requests",
  "execution.update": "Update live execution and actuals",
  "risk.manage": "Manage the risk register",
  "export.run": "Export workbooks and reports",
  "documents.upload": "Upload documents",
  "ai.use": "Use the AI assistant",
  "standards.manage": "Propose company standards changes",
  "standards.approve": "Approve company standards (rates, capacities, waste)",
  "users.manage": "Manage users and roles",
  "vendors.manage": "Manage vendors",
  "knowledge.manage": "Manage the knowledge base and imports",
  "audit.read": "View audit history",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

const DEPT_MANAGER: Permission[] = ["project.read", "submission.create", "submission.submit", "submission.review", "documents.upload", "ai.use", "execution.update", "export.run", "risk.manage", "schedule.edit"];

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  PROJECT_MANAGER: ["project.read", "project.create", "project.edit", "project.assign", "submission.create", "submission.submit", "plan.generate", "plan.review", "plan.approve", "schedule.edit", "budget.read", "procurement.manage", "execution.update", "risk.manage", "export.run", "documents.upload", "ai.use", "standards.manage", "audit.read"],
  ACCOUNT_MANAGER: ["project.read", "project.create", "project.edit", "submission.create", "submission.submit", "documents.upload", "ai.use", "export.run", "budget.read"],
  PRODUCTION_MANAGER: [...DEPT_MANAGER, "standards.manage"],
  AV_MANAGER: [...DEPT_MANAGER, "standards.manage"],
  LOGISTICS_MANAGER: [...DEPT_MANAGER, "standards.manage"],
  ACCOMMODATION_MANAGER: DEPT_MANAGER,
  CREATIVE_MANAGER: DEPT_MANAGER,
  PROCUREMENT_MANAGER: [...DEPT_MANAGER, "procurement.manage", "vendors.manage", "budget.read"],
  FINANCE: ["project.read", "budget.read", "budget.approve", "procurement.approve", "export.run", "ai.use", "audit.read"],
  DEPARTMENT_MEMBER: ["project.read", "submission.create", "submission.submit", "documents.upload", "execution.update", "ai.use"],
  VIEWER: ["project.read"],
};

/** Department a manager role owns technical approval for */
export const ROLE_DEPARTMENT: Record<string, string> = {
  PRODUCTION_MANAGER: "PRODUCTION",
  AV_MANAGER: "AV",
  LOGISTICS_MANAGER: "LOGISTICS",
  ACCOMMODATION_MANAGER: "ACCOMMODATION",
  CREATIVE_MANAGER: "CREATIVE",
  PROCUREMENT_MANAGER: "PROCUREMENT",
  ACCOUNT_MANAGER: "ACCOUNT",
  PROJECT_MANAGER: "PMO",
  FINANCE: "FINANCE",
};

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  PROJECT_MANAGER: "Project Manager",
  ACCOUNT_MANAGER: "Account Manager",
  PRODUCTION_MANAGER: "Production Manager",
  AV_MANAGER: "AV Manager",
  LOGISTICS_MANAGER: "Logistics Manager",
  ACCOMMODATION_MANAGER: "Accommodation Manager",
  CREATIVE_MANAGER: "Creative Manager",
  PROCUREMENT_MANAGER: "Procurement Manager",
  FINANCE: "Finance",
  DEPARTMENT_MEMBER: "Department Member",
  VIEWER: "Viewer",
};

export const DEPARTMENTS = [
  { key: "PMO", name: "Project Management", nameAr: "إدارة المشاريع" },
  { key: "ACCOUNT", name: "Account Management", nameAr: "إدارة الحسابات" },
  { key: "PRODUCTION", name: "Production", nameAr: "الإنتاج" },
  { key: "AV", name: "AV & Technical", nameAr: "الصوت والصورة والتقنية" },
  { key: "LOGISTICS", name: "Logistics", nameAr: "اللوجستيات" },
  { key: "ACCOMMODATION", name: "Accommodation", nameAr: "الإقامة" },
  { key: "CREATIVE", name: "Creative & Branding", nameAr: "الإبداع والهوية" },
  { key: "PROCUREMENT", name: "Procurement", nameAr: "المشتريات" },
  { key: "FINANCE", name: "Finance", nameAr: "المالية" },
  { key: "MANAGEMENT", name: "Management", nameAr: "الإدارة العليا" },
] as const;

/** which role decides a technical approval for a department's submissions */
export const DEPARTMENT_APPROVER_ROLE: Record<string, string> = {
  PRODUCTION: "PRODUCTION_MANAGER",
  AV: "AV_MANAGER",
  LOGISTICS: "LOGISTICS_MANAGER",
  ACCOMMODATION: "ACCOMMODATION_MANAGER",
  CREATIVE: "CREATIVE_MANAGER",
  PROCUREMENT: "PROCUREMENT_MANAGER",
  ACCOUNT: "PROJECT_MANAGER",
  PMO: "PROJECT_MANAGER",
  FINANCE: "FINANCE",
  MANAGEMENT: "SUPER_ADMIN",
};
