/** UI dictionaries. Business data (names, specs) is shown as entered. */
export const en = {
  app: { name: "PARADIGM EVENTOPS", subtitle: "Event Operations & Intelligence Platform", tagline: "Plan Smarter. Execute Better. Control Everything." },
  nav: {
    workspace: "Workspace", operations: "Departments", control: "Control", admin: "Administration",
    dashboard: "Dashboard", projects: "Projects", myTasks: "My Tasks", planning: "Planning & Scheduling", production: "Production",
    av: "AV & Technical", logistics: "Logistics", accommodation: "Accommodation", creative: "Creative & Branding", procurement: "Procurement",
    resources: "Resources & Inventory", risks: "Risk Management", reports: "Reports", settings: "Settings", approvals: "Approval Center",
    execution: "Live Execution", documents: "Document Center", assistant: "AI Assistant", brain: "Memory & Learning", notifications: "Notifications", knowledge: "Knowledge Base",
    users: "Users & Roles", budget: "Budget", account: "Account Management", manpower: "Manpower",
  },
  header: { search: "Search projects, tasks, items…", quickActions: "Quick actions", newProject: "New project", addProduction: "Add production requirements", askAi: "Ask the AI assistant", language: "Language", signOut: "Sign out", profile: "Profile", project: "Project", allProjects: "All projects", department: "Department" },
  common: {
    save: "Save", cancel: "Cancel", submit: "Submit", approve: "Approve", reject: "Reject", edit: "Edit", delete: "Delete", view: "View", back: "Back", next: "Next",
    export: "Export", download: "Download", upload: "Upload", search: "Search", filter: "Filter", all: "All", status: "Status", actions: "Actions", none: "None",
    open: "Open", close: "Close", total: "Total", details: "Details", demo: "DEMO DATA — NOT APPROVED PARADIGM COMPANY DATA", loading: "Loading…",
    noData: "No records yet", required: "Required", optional: "Optional", generatePlan: "Generate plan", viewAll: "View all", today: "Today", due: "Due",
  },
  login: { title: "Sign in", subtitle: "Use your Paradigm account to continue", email: "Work email", password: "Password", signIn: "Sign in", demoAccounts: "Development demo accounts", invalid: "Invalid email or password", internal: "Internal use only — Paradigm LTD" },
};

export type Dict = typeof en;

export const ar: Dict = {
  app: { name: "PARADIGM EVENTOPS", subtitle: "منصة عمليات وذكاء الفعاليات", tagline: "خطّط بذكاء. نفّذ بإتقان. تحكّم في كل شيء." },
  nav: {
    workspace: "مساحة العمل", operations: "الأقسام", control: "التحكم", admin: "الإدارة",
    dashboard: "لوحة التحكم", projects: "المشاريع", myTasks: "مهامي", planning: "التخطيط والجدولة", production: "الإنتاج",
    av: "الصوت والصورة والتقنية", logistics: "اللوجستيات", accommodation: "الإقامة", creative: "الإبداع والهوية", procurement: "المشتريات",
    resources: "الموارد والمخزون", risks: "إدارة المخاطر", reports: "التقارير", settings: "الإعدادات", approvals: "مركز الاعتمادات",
    execution: "التنفيذ المباشر", documents: "مركز المستندات", assistant: "المساعد الذكي", brain: "الذاكرة والتعلّم", notifications: "الإشعارات", knowledge: "قاعدة المعرفة",
    users: "المستخدمون والصلاحيات", budget: "الميزانية", account: "إدارة الحسابات", manpower: "القوى العاملة",
  },
  header: { search: "ابحث في المشاريع والمهام والبنود…", quickActions: "إجراءات سريعة", newProject: "مشروع جديد", addProduction: "إضافة متطلبات الإنتاج", askAi: "اسأل المساعد الذكي", language: "اللغة", signOut: "تسجيل الخروج", profile: "الملف الشخصي", project: "المشروع", allProjects: "كل المشاريع", department: "القسم" },
  common: {
    save: "حفظ", cancel: "إلغاء", submit: "إرسال", approve: "اعتماد", reject: "رفض", edit: "تعديل", delete: "حذف", view: "عرض", back: "رجوع", next: "التالي",
    export: "تصدير", download: "تنزيل", upload: "رفع", search: "بحث", filter: "تصفية", all: "الكل", status: "الحالة", actions: "إجراءات", none: "لا يوجد",
    open: "فتح", close: "إغلاق", total: "الإجمالي", details: "التفاصيل", demo: "بيانات تجريبية — ليست بيانات معتمدة لشركة بارادايم", loading: "جارٍ التحميل…",
    noData: "لا توجد سجلات بعد", required: "مطلوب", optional: "اختياري", generatePlan: "إنشاء الخطة", viewAll: "عرض الكل", today: "اليوم", due: "الاستحقاق",
  },
  login: { title: "تسجيل الدخول", subtitle: "استخدم حساب بارادايم للمتابعة", email: "البريد الإلكتروني للعمل", password: "كلمة المرور", signIn: "دخول", demoAccounts: "حسابات العرض للتطوير", invalid: "البريد الإلكتروني أو كلمة المرور غير صحيحة", internal: "للاستخدام الداخلي فقط — بارادايم المحدودة" },
};

/** Labels for enum values shown in the UI */
export const STATUS_LABELS: Record<string, { en: string; ar: string }> = {
  LEAD: { en: "Lead", ar: "فرصة" }, PLANNING: { en: "Planning", ar: "تخطيط" }, AWAITING_INPUTS: { en: "Awaiting inputs", ar: "بانتظار المدخلات" },
  UNDER_REVIEW: { en: "Under review", ar: "قيد المراجعة" }, APPROVED: { en: "Approved", ar: "معتمد" }, IN_PREPARATION: { en: "In preparation", ar: "قيد التجهيز" },
  IN_EXECUTION: { en: "In execution", ar: "قيد التنفيذ" }, COMPLETED: { en: "Completed", ar: "مكتمل" }, CANCELLED: { en: "Cancelled", ar: "ملغى" },
  DRAFT: { en: "Draft", ar: "مسودة" }, EXTRACTING: { en: "Extracting", ar: "جارٍ الاستخراج" }, NEEDS_INFORMATION: { en: "Needs information", ar: "يحتاج معلومات" },
  SUBMITTED: { en: "Submitted", ar: "مُرسل" }, REJECTED: { en: "Rejected", ar: "مرفوض" }, REVISED: { en: "Revised", ar: "مُعدّل" },
  VERIFIED: { en: "Verified", ar: "مُتحقق" }, CALCULATED: { en: "Calculated", ar: "محسوب" }, ESTIMATED: { en: "Estimated", ar: "تقديري" },
  PENDING: { en: "Pending", ar: "معلّق" }, CHANGES_REQUESTED: { en: "Changes requested", ar: "مطلوب تعديلات" },
  NOT_STARTED: { en: "Not started", ar: "لم يبدأ" }, IN_PROGRESS: { en: "In progress", ar: "قيد التنفيذ" }, BLOCKED: { en: "Blocked", ar: "متوقف" }, DELAYED: { en: "Delayed", ar: "متأخر" },
  CONFIRMED: { en: "Confirmed", ar: "مؤكد" }, REQUESTED: { en: "Requested", ar: "مطلوب" }, QUOTED: { en: "Quoted", ar: "مُسعّر" },
  IDENTIFIED: { en: "Identified", ar: "محدد" }, MONITORING: { en: "Monitoring", ar: "تحت المراقبة" }, MITIGATED: { en: "Mitigated", ar: "تم التخفيف" }, TRIGGERED: { en: "Triggered", ar: "وقع" }, CLOSED: { en: "Closed", ar: "مغلق" },
  RFQ_PREPARED: { en: "RFQ prepared", ar: "طلب عرض سعر جاهز" }, PENDING_APPROVAL: { en: "Pending approval", ar: "بانتظار الاعتماد" }, ORDERED: { en: "Ordered", ar: "تم الطلب" },
  PARTIALLY_DELIVERED: { en: "Partially delivered", ar: "تم التوريد جزئياً" }, DELIVERED: { en: "Delivered", ar: "تم التوريد" },
  SUPERSEDED: { en: "Superseded", ar: "مستبدل" }, PROPOSED: { en: "Proposed", ar: "مقترح" }, APPLIED: { en: "Applied", ar: "مطبق" },
  MISSING: { en: "Missing", ar: "مفقود" }, PROVIDED: { en: "Provided", ar: "مُقدم" },
  LOW: { en: "Low", ar: "منخفض" }, MEDIUM: { en: "Medium", ar: "متوسط" }, HIGH: { en: "High", ar: "مرتفع" }, CRITICAL: { en: "Critical", ar: "حرج" },
  DEMO: { en: "Demo", ar: "تجريبي" }, RETIRED: { en: "Retired", ar: "متقاعد" },
};
