import "server-only";
import path from "node:path";
import ExcelJS from "exceljs";
import { db, num } from "@/lib/db";
import type { PlanResult } from "@/engines/pipeline";
import { redactChangeEntries, redactPlanFinancials } from "@/lib/financial";
import { actualVsPlanned } from "@/server/queries/execution";
import { BRAND } from "@/config/brand";
import { DEMO_LABEL } from "@/demo/aswan";

/**
 * Master Project Workbook (spec §27): PARADIGM_EVENTOPS_[PROJECT]_MASTER_PLAN.xlsx
 * 20 branded sheets with typed cells, units, filters, frozen headers, conditional formatting
 * for data states and calculation traceability. Missing data stays empty/flagged — never filled.
 */
type Col = { header: string; key: string; width?: number; fmt?: string };
const NAVY = "FF061520", CYAN = "FF00A8C8", PALE = "FFE8F6FA";
const STATE_FILL: Record<string, string> = { NEEDS_INFORMATION: "FFFDE2E2", ESTIMATED: "FFFFF3D6", CALCULATED: "FFE3F2FD", APPROVED: "FFE3F7EC", VERIFIED: "FFE3F7EC", REJECTED: "FFFDE2E2", UNDER_REVIEW: "FFEFE7FB" };
const tz = (ms: number | Date | null | undefined) => (ms == null ? null : new Date(new Date(ms).getTime() + 2 * 3600000)); // Excel has no TZ: show Cairo local time
const DT = "dd-mmm-yy hh:mm", D = "dd-mmm-yy", N0 = "#,##0", N2 = "#,##0.00", MONEY = '#,##0" "';

export const SHEET_GROUPS: Record<string, string[]> = {
  production: ["01", "04", "05", "06", "07", "08"], av: ["01", "09", "10"], logistics: ["01", "11", "12"], accommodation: ["01", "13"],
  procurement: ["01", "14"], budget: ["01", "16"], risks: ["01", "15"],
};

/** Columns that carry money; removed from every sheet when the requester lacks budget.read (P1-2). */
const MONEY_HEADERS = new Set(["Amount", "Cost impact", "Cost", "Daily cost", "Est. cost", "Rental cost", "Unit cost", "Unit price", "Rate"]);
/** Sheets that are financial in their entirety. */
const FINANCIAL_SHEETS = new Set(["16"]);

/**
 * `includeFinancials` must be `canReadFinancials(user)` of the requester. Without it the workbook contains
 * no costs, prices, rates or budget: the plan is redacted, money columns and the budget sheet are omitted.
 */
export async function buildWorkbook(companyId: string, projectId: string, only?: string[], opts: { includeFinancials: boolean } = { includeFinancials: false }) {
  const fin = opts.includeFinancials;
  const p = await db.project.findFirstOrThrow({ where: { id: projectId, companyId }, include: { venue: true, projectManager: true, accountManager: true, departments: { include: { department: true, lead: true } } } });
  const version = await db.scheduleVersion.findFirst({ where: { projectId, status: { not: "SUPERSEDED" } }, orderBy: [{ status: "asc" }, { version: "desc" }] });
  const approved = await db.scheduleVersion.findFirst({ where: { projectId, status: "APPROVED" }, orderBy: { version: "desc" } });
  const v = approved ?? version;
  if (!v) throw new Error("No plan has been generated for this project");
  const P = fin ? (v.snapshot as unknown as PlanResult) : redactPlanFinancials(v.snapshot as unknown as PlanResult);
  const [tasks, reqs, submissions, procurement, risks, changes, approvals, items, costs] = await Promise.all([
    db.task.findMany({ where: { projectId }, include: { department: true, laborCategory: true, predecessors: { include: { predecessor: true } } }, orderBy: { plannedStart: "asc" } }),
    db.eventRequirement.findMany({ where: { projectId } }),
    db.departmentSubmission.findMany({ where: { projectId }, include: { department: true, submittedBy: true, reviewer: true } }),
    db.procurementRequest.findMany({ where: { projectId }, include: { vendor: true }, orderBy: { requiredByDate: "asc" } }).then((rows) => (fin ? rows : rows.map((r) => ({ ...r, unitPrice: null })))),
    db.risk.findMany({ where: { projectId }, include: { owner: true, department: true }, orderBy: { severity: "desc" } }).then((rows) => (fin ? rows : rows.map((r) => ({ ...r, costImpact: null })))),
    db.projectChange.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
    db.approval.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
    db.productionItem.findMany({ where: { projectId }, include: { specs: { include: { material: true } } }, orderBy: { code: "asc" } }),
    fin ? db.costItem.findMany({ where: { projectId, generated: false } }) : Promise.resolve([]),
  ]);
  const users = new Map((await db.user.findMany({ where: { companyId }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));

  const wb = new ExcelJS.Workbook();
  wb.creator = BRAND.product;
  wb.company = BRAND.organization;
  wb.created = new Date();
  wb.title = `${p.name} — Master Plan`;
  const include = (id: string) => (!only || only.includes(id)) && (fin || !FINANCIAL_SHEETS.has(id));
  const banner = (ws: ExcelJS.Worksheet, title: string, cols: number) => {
    ws.mergeCells(1, 1, 1, Math.max(cols, 4));
    const t = ws.getCell(1, 1);
    t.value = `${BRAND.product}  ·  ${title}`;
    t.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" }, name: "Calibri" };
    t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    t.alignment = { vertical: "middle", indent: 1 };
    ws.getRow(1).height = 28;
    ws.mergeCells(2, 1, 2, Math.max(cols, 4));
    const s = ws.getCell(2, 1);
    s.value = `${p.name} (${p.code}) · Plan v${v.version} — ${v.status.replace("_", " ")} · Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC${p.isDemo ? ` · ${DEMO_LABEL}` : ""}`;
    s.font = { size: 9, italic: true, color: { argb: p.isDemo ? "FFB45309" : "FF4A7A95" } };
    s.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALE } };
  };
  const table = (id: string, name: string, title: string, allCols: Col[], rows: Record<string, unknown>[], opts: { stateKey?: string; note?: string } = {}) => {
    if (!include(id)) return null;
    const cols = fin ? allCols : allCols.filter((c) => !MONEY_HEADERS.has(c.header));
    const ws = wb.addWorksheet(`${id}_${name}`.slice(0, 31), { views: [{ state: "frozen", ySplit: opts.note ? 4 : 3 }], properties: { tabColor: { argb: CYAN } } });
    banner(ws, title, cols.length);
    let hr = 3;
    if (opts.note) { ws.mergeCells(3, 1, 3, Math.max(cols.length, 4)); const c = ws.getCell(3, 1); c.value = opts.note; c.font = { size: 9, color: { argb: "FF4A7A95" } }; c.alignment = { wrapText: true }; ws.getRow(3).height = 30; hr = 4; }
    const header = ws.getRow(hr);
    cols.forEach((c, i) => {
      const cell = header.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CYAN } };
      cell.alignment = { vertical: "middle", wrapText: true };
      ws.getColumn(i + 1).width = c.width ?? Math.max(12, c.header.length + 2);
      if (c.fmt) ws.getColumn(i + 1).numFmt = c.fmt;
    });
    header.height = 30;
    rows.forEach((r) => {
      const row = ws.addRow(cols.map((c) => { const v = r[c.key]; return v === undefined ? null : v; }));
      row.alignment = { vertical: "top", wrapText: true };
      if (opts.stateKey) {
        const st = String(r[opts.stateKey] ?? "");
        const idx = cols.findIndex((c) => c.key === opts.stateKey);
        if (STATE_FILL[st] && idx >= 0) row.getCell(idx + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: STATE_FILL[st] } };
      }
    });
    ws.autoFilter = { from: { row: hr, column: 1 }, to: { row: hr + rows.length, column: cols.length } };
    if (!rows.length) { const r = ws.addRow(["No data recorded"]); r.font = { italic: true, color: { argb: "FF7AAFC8" } }; }
    return ws;
  };

  // 01 overview
  if (include("01")) {
    const ws = wb.addWorksheet("01_Project_Overview", { properties: { tabColor: { argb: NAVY } } });
    ws.getColumn(1).width = 34; ws.getColumn(2).width = 60;
    banner(ws, "Project overview", 2);
    try {
      const img = wb.addImage({ filename: path.join(process.cwd(), "public", BRAND.logo.fullWhite), extension: "png" });
      ws.mergeCells("C1:D6");
      ws.getCell("C1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      ws.addImage(img, { tl: { col: 2.15, row: 0.2 }, ext: { width: 108, height: 90 } });
      ws.getColumn(3).width = 10; ws.getColumn(4).width = 10;
    } catch { /* logo optional */ }
    const kv: [string, unknown, string?][] = [
      ["Project", p.name], ["Code", p.code], ["Client", p.client], ["Category", p.category], ["Location / venue", `${p.location} — ${p.venue?.name ?? "venue TBC"}`],
      ["Participants", p.participants, N0], ["Setup start", tz(p.setupStart), DT], ["Setup end", tz(p.setupEnd), DT], ["Event start", tz(p.eventStart), DT], ["Event end", tz(p.eventEnd), DT], ["Dismantle end", tz(p.dismantleEnd), DT],
      ["Project Manager", p.projectManager?.name ?? null], ["Account Manager", p.accountManager?.name ?? null], ["Status", p.status], ["Plan version", `v${v.version} (${v.status})`], ["Plan approved", tz(v.approvedAt), DT],
      ...(fin ? [["Budget", num(p.budgetAmount), MONEY], ["Currency", p.currency], ["Planned cost (budget currency)", P.budget.totalInBudgetCurrency, MONEY], ["Budget variance", P.budget.variance, MONEY]] as [string, unknown, string?][] : [["Financial data", "Omitted — requires the budget.read permission"]] as [string, unknown, string?][]),
      ["Schedule feasible", P.schedule.feasible ? "Yes" : "No — see conflicts"], ["Open errors / warnings", `${P.readiness.errors} / ${P.readiness.warnings}`], ["Tasks / critical", `${P.tasks.length} / ${P.schedule.criticalPath.length}`],
      ["Calculation engine", "Deterministic planning engines v" + (P.traces[0]?.engineVersion ?? "1")], ["Times", "Africa/Cairo local time"],
    ];
    kv.forEach(([k, val, fmt], i) => { const r = ws.getRow(4 + i); r.getCell(1).value = k; r.getCell(1).font = { bold: true, color: { argb: "FF0A1F32" } }; r.getCell(2).value = val as ExcelJS.CellValue; if (fmt) r.getCell(2).numFmt = fmt; });
    const start = 4 + kv.length + 1;
    ws.getRow(start).getCell(1).value = "Department"; ws.getRow(start).getCell(2).value = "Status / lead / due";
    [1, 2].forEach((c) => { const cell = ws.getRow(start).getCell(c); cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CYAN } }; });
    p.departments.forEach((d, i) => { const r = ws.getRow(start + 1 + i); r.getCell(1).value = d.department.name; r.getCell(2).value = `${d.status} · ${d.lead?.name ?? "—"} · due ${d.dueDate?.toISOString().slice(0, 10) ?? "—"}`; });
    const a = start + p.departments.length + 3;
    ws.getRow(a).getCell(1).value = "Key assumptions"; ws.getRow(a).getCell(1).font = { bold: true };
    [...new Set(P.traces.flatMap((t) => t.assumptions))].slice(0, 25).forEach((x, i) => { ws.getRow(a + 1 + i).getCell(1).value = "•"; ws.getRow(a + 1 + i).getCell(2).value = x; });
  }

  const ganttRows = tasks.map((t) => ({ wbs: t.wbsCode, name: t.name, phase: t.phase, dept: t.department?.key ?? null, start: tz(t.plannedStart), finish: tz(t.plannedEnd), dur: t.durationHours, crew: t.crewSize, trade: t.laborCategory?.name ?? null, hours: t.laborHours, float: t.totalFloatH, critical: t.isCritical ? "YES" : "", milestone: t.isMilestone ? "◆" : "", preds: t.predecessors.map((x) => `${x.predecessor.wbsCode}${x.type !== "FS" ? x.type : ""}${x.lagHours ? `+${x.lagHours}h` : ""}`).join(", "), status: t.status, pct: t.percentComplete / 100, aStart: tz(t.actualStart), aEnd: tz(t.actualEnd), deadline: tz(t.deadline), location: t.location, note: t.description }));
  table("02", "Master_Timeline", "Master timeline", [{ header: "WBS", key: "wbs", width: 8 }, { header: "Task", key: "name", width: 44 }, { header: "Phase", key: "phase" }, { header: "Dept", key: "dept", width: 10 }, { header: "Start", key: "start", width: 16, fmt: DT }, { header: "Finish", key: "finish", width: 16, fmt: DT }, { header: "Duration (h)", key: "dur", fmt: N2 }, { header: "Crew", key: "crew", width: 8 }, { header: "Trade", key: "trade" }, { header: "Labour h", key: "hours", fmt: N2 }, { header: "Float (h)", key: "float", fmt: N2 }, { header: "Critical", key: "critical", width: 9 }, { header: "Predecessors", key: "preds", width: 18 }, { header: "Deadline", key: "deadline", width: 16, fmt: DT }, { header: "Location", key: "location", width: 22 }, { header: "Note", key: "note", width: 30 }], ganttRows, { note: `Scheduler: calendar-aware CPM + resource-constrained serial scheduling. Makespan ${P.schedule.makespanHours} h. Conflicts: ${P.schedule.conflicts.filter((c) => c.severity === "error").map((c) => c.message).join(" | ") || "none"}` });
  table("03", "Gantt_Data", "Gantt data (import into any Gantt tool)", [{ header: "WBS", key: "wbs", width: 8 }, { header: "Task", key: "name", width: 40 }, { header: "Start", key: "start", width: 16, fmt: DT }, { header: "Finish", key: "finish", width: 16, fmt: DT }, { header: "Duration h", key: "dur", fmt: N2 }, { header: "Predecessors", key: "preds", width: 18 }, { header: "Milestone", key: "milestone", width: 9 }, { header: "Critical", key: "critical", width: 9 }, { header: "% complete", key: "pct", fmt: "0%" }, { header: "Status", key: "status" }, { header: "Actual start", key: "aStart", width: 16, fmt: DT }, { header: "Actual finish", key: "aEnd", width: 16, fmt: DT }], ganttRows);
  table("04", "Department_Requirements", "Department requirements & submissions", [{ header: "Source", key: "src" }, { header: "Department", key: "dept" }, { header: "Title / requirement", key: "title", width: 50 }, { header: "Qty", key: "qty", fmt: N2 }, { header: "Unit", key: "unit" }, { header: "Method", key: "method" }, { header: "Submitted by", key: "by", width: 22 }, { header: "Status", key: "status", width: 18 }, { header: "Reviewer", key: "rev", width: 22 }, { header: "Review note", key: "note", width: 40 }],
    [...reqs.map((r) => ({ src: "Client scope", dept: "ACCOUNT", title: r.title, qty: r.quantity, unit: r.unit, status: r.status })), ...submissions.map((s) => ({ src: "Submission", dept: s.department.key, title: s.title, method: s.method, by: s.submittedBy.name, status: s.status, rev: s.reviewer?.name ?? null, note: s.reviewNote })), ...items.map((i) => ({ src: "Production item", dept: "PRODUCTION", title: `${i.code} ${i.name} — ${i.widthM ?? "?"}×${i.heightM ?? "?"}×${i.depthM ?? "?"} m · ${i.finishing ?? "finishing TBC"}`, qty: i.quantity, unit: "pcs", status: i.approvalStatus === "APPROVED" ? "APPROVED" : i.calculationState }))], { stateKey: "status" });
  table("05", "Production_BOQ", "Production bill of quantities", [{ header: "Code", key: "code" }, { header: "Material", key: "name", width: 32 }, { header: "Category", key: "category" }, { header: "Items", key: "items", width: 20 }, { header: "Net qty", key: "net", fmt: N2 }, { header: "Waste %", key: "waste", fmt: "0.0" }, { header: "Gross qty", key: "gross", fmt: N2 }, { header: "Purchase qty", key: "buy", fmt: N2 }, { header: "Unit", key: "unit" }, { header: "Unit cost", key: "unitCost", fmt: MONEY }, { header: "Cost", key: "cost", fmt: MONEY }, { header: "Currency", key: "cur", width: 9 }, { header: "State", key: "state", width: 18 }, { header: "Method / formula", key: "method", width: 40 }, { header: "Trace hash", key: "trace", width: 18 }],
    P.production.boq.map((l) => ({ code: l.code, name: l.name, category: l.category, items: l.itemCodes.join(", "), net: l.netQuantity, waste: l.wastePct, gross: l.grossQuantity, buy: l.purchaseQuantity, unit: l.unit, unitCost: l.unitCost, cost: l.cost, cur: l.currency, state: l.state, method: l.method, trace: P.production.traces[l.traceIndex]?.inputHash })), { stateKey: "state", note: "Boards = optimised cutting plan + breakage allowance; timber = 1D cutting stock from drawing members; paint = area × coats ÷ coverage × (1+waste). See sheet 06 for every calculation." });
  table("06", "Material_Calculations", "Calculation records (traceability)", [{ header: "Engine", key: "engine", width: 20 }, { header: "Title", key: "title", width: 40 }, { header: "Formula", key: "formula", width: 60 }, { header: "Outputs", key: "outputs", width: 50 }, { header: "Assumptions", key: "assumptions", width: 60 }, { header: "Units", key: "units" }, { header: "State", key: "state", width: 18 }, { header: "Engine v", key: "ver", width: 9 }, { header: "Input hash", key: "hash", width: 18 }],
    P.traces.map((t) => ({ engine: t.engine, title: t.title, formula: t.formula, outputs: JSON.stringify(t.outputs), assumptions: t.assumptions.join(" | "), units: t.units, state: t.state, ver: t.engineVersion, hash: t.inputHash })), { stateKey: "state" });
  table("07", "Board_Cutting_List", "Board cutting list & timber cuts", [{ header: "Material", key: "mat" }, { header: "Board / stick #", key: "board", width: 10 }, { header: "Piece", key: "piece", width: 36 }, { header: "X (m)", key: "x", fmt: "0.000" }, { header: "Y (m)", key: "y", fmt: "0.000" }, { header: "Length (m)", key: "w", fmt: "0.000" }, { header: "Width (m)", key: "h", fmt: "0.000" }, { header: "Rotated", key: "rot", width: 9 }, { header: "Utilisation / offcut", key: "util", width: 20 }],
    [...P.production.cutting.flatMap((c) => c.result.layouts.flatMap((l) => l.placements.map((pl) => ({ mat: c.code, board: l.board, piece: pl.label, x: pl.x, y: pl.y, w: pl.w, h: pl.h, rot: pl.rotated ? "yes" : "", util: `${c.result.utilizationPct}% overall` })))), ...P.production.timber.flatMap((tm) => tm.result.sticks.flatMap((s) => s.cuts.map((ct) => ({ mat: tm.code, board: s.stick, piece: ct.label, w: ct.lengthM, util: `offcut ${s.offcutM} m` }))))]);
  table("08", "Manpower_Plan", "Manpower plan", [{ header: "Trade", key: "trade" }, { header: "Phase", key: "phase" }, { header: "Labour hours", key: "hours", fmt: N2 }, { header: "Window days", key: "days", fmt: N2 }, { header: "Productive h / person", key: "pp", fmt: N2 }, { header: "Required crew", key: "crew" }, { header: "Available", key: "avail" }, { header: "Shortfall", key: "short" }, { header: "Crew with overtime", key: "ot" }, { header: "Est. cost", key: "cost", fmt: MONEY }, { header: "State", key: "state", width: 18 }],
    [...P.trades.map((t) => ({ trade: t.name, phase: t.phase, hours: t.totalHours, days: t.windowDays, pp: t.productiveHoursPerPerson, crew: t.requiredCrew, avail: t.available, short: t.shortfall || null, ot: t.crewWithOvertime, cost: t.estimatedCost, state: t.state })), ...P.laborDemands.filter((d) => d.hours == null).map((d) => ({ trade: d.laborKey, phase: d.phase, state: "NEEDS_INFORMATION", hours: null, crew: null }))], { stateKey: "state", note: "Required crew = CEILING(total labour hours ÷ productive hours per person in the phase window). Missing productivity rates are listed as NEEDS_INFORMATION." });
  table("09", "AV_Equipment", "AV equipment requirements", [{ header: "Requirement", key: "desc", width: 36 }, { header: "Category", key: "cat" }, { header: "Model", key: "model", width: 28 }, { header: "Required", key: "req" }, { header: "Backup", key: "bk" }, { header: "Total", key: "tot" }, { header: "Power W", key: "pw", fmt: N0 }, { header: "Tech hours", key: "th", fmt: N2 }, { header: "Weight kg", key: "kg", fmt: N0 }, { header: "Volume m³", key: "m3", fmt: N2 }],
    P.av.lines.map((l) => ({ desc: l.description, cat: l.category, model: l.model, req: l.required, bk: l.backup, tot: l.total, pw: l.powerW, th: l.techHours, kg: l.weightKg, m3: l.volumeM3 })), { note: `Total AV load ${P.av.totalPowerKw} kW. Approvals required: ${P.av.approvals.join("; ") || "—"}` });
  table("10", "Equipment_Allocation", "Equipment allocation & rentals", [{ header: "Requirement", key: "desc", width: 36 }, { header: "Owned available", key: "own" }, { header: "Allocated", key: "alloc" }, { header: "Rental", key: "rent" }, { header: "Rental cost", key: "cost", fmt: MONEY }, { header: "Conflicts / bookings elsewhere", key: "conf", width: 50 }],
    P.av.lines.map((l) => ({ desc: l.description, own: l.ownedAvailable, alloc: l.allocated, rent: l.rental || null, cost: l.rentalCost, conf: l.conflicts.join("; ") })));
  table("11", "Transportation_Plan", "Transportation plan & cargo", [{ header: "Cargo", key: "name", width: 36 }, { header: "Source", key: "src" }, { header: "Units", key: "q" }, { header: "kg / unit", key: "kg", fmt: N2 }, { header: "m³ / unit", key: "m3", fmt: "0.000" }, { header: "Longest part m", key: "dim", fmt: N2 }, { header: "Fragile", key: "fr", width: 8 }, { header: "Vehicle", key: "veh" }],
    P.cargo.map((c) => ({ name: c.name, src: c.sourceType, q: c.quantity, kg: c.unitWeightKg, m3: c.unitVolumeM3, dim: c.maxDimM, fr: c.fragile ? "yes" : "", veh: P.logistics.trips.find((t) => t.items.some((i) => i.key === c.key))?.vehicleCode ?? (P.logistics.unassigned.find((u) => u.key === c.key)?.reason ?? null) })),
    { note: `Route ${P.logistics.route ? `${P.logistics.route.origin} → ${P.logistics.route.destination}: ${P.logistics.route.durationHours ?? "?"} h, ${P.logistics.route.distanceKm ?? "?"} km (${P.logistics.route.approved ? "approved" : "NOT approved"} — ${P.logistics.route.source})` : "not defined"}. Total ${P.logistics.totals.weightKg} kg / ${P.logistics.totals.volumeM3} m³.` });
  table("12", "Vehicle_Assignments", "Vehicle assignments", [{ header: "Vehicle", key: "v" }, { header: "Type", key: "type" }, { header: "Load kg", key: "kg", fmt: N0 }, { header: "Load m³", key: "m3", fmt: N2 }, { header: "Weight util", key: "wu", fmt: "0.0%" }, { header: "Volume util", key: "vu", fmt: "0.0%" }, { header: "Daily cost", key: "cost", fmt: MONEY }, { header: "Items", key: "items", width: 60 }],
    [...P.logistics.trips.map((t) => ({ v: t.vehicleCode, type: t.vehicleType, kg: t.weightKg, m3: t.volumeM3, wu: t.weightUtilPct / 100, vu: t.volumeUtilPct / 100, cost: t.dailyCost, items: t.items.map((i) => `${i.units}× ${i.name}`).join("; ") })), ...(P.logistics.backupVehicle ? [{ v: P.logistics.backupVehicle.code, type: P.logistics.backupVehicle.type, items: "STANDBY BACKUP" }] : [])]);
  table("13", "Accommodation_Rooming", "Rooming list", [{ header: "Room", key: "room", width: 16 }, { header: "Guests", key: "guests", width: 40 }, { header: "Hotel", key: "hotel", width: 26 }, { header: "Room type", key: "type" }, { header: "Check-in", key: "in", fmt: D }, { header: "Check-out", key: "out", fmt: D }, { header: "Nights", key: "n" }, { header: "Rate", key: "rate", fmt: MONEY }, { header: "Cost", key: "cost", fmt: MONEY }, { header: "Status", key: "status" }],
    P.accommodation.rooms.map((r) => ({ room: r.key.startsWith("single|") ? "Single" : r.key.split("|")[1], guests: r.guests.join(", "), hotel: r.hotelName, type: r.roomType, in: r.checkIn ? new Date(r.checkIn) : null, out: r.checkOut ? new Date(r.checkOut) : null, n: r.nights, rate: r.nightlyRate, cost: r.cost, status: r.status })), { note: `${P.accommodation.roomCount} rooms · ${P.accommodation.roomNights} room nights · ${P.accommodation.unconfirmed} unconfirmed` });
  table("14", "Procurement_Tracker", "Procurement tracker", [{ header: "Code", key: "code", width: 18 }, { header: "Item", key: "item", width: 32 }, { header: "Qty", key: "q", fmt: N2 }, { header: "Unit", key: "u" }, { header: "Vendor", key: "vendor", width: 26 }, { header: "Unit price", key: "price", fmt: MONEY }, { header: "Tax %", key: "tax" }, { header: "Currency", key: "cur" }, { header: "Required by", key: "req", fmt: D }, { header: "Order by / notes", key: "spec", width: 36 }, { header: "Status", key: "status", width: 16 }, { header: "Received", key: "rcv", fmt: N2 }],
    procurement.map((r) => ({ code: r.code, item: r.item, q: r.quantity, u: r.unit, vendor: r.vendor?.name ?? null, price: num(r.unitPrice), tax: r.taxPct, cur: r.currency, req: r.requiredByDate, spec: r.specifications, status: r.status, rcv: r.receivedQuantity || null })));
  table("15", "Risk_Register", "Risk register & contingency", [{ header: "ID", key: "id", width: 7 }, { header: "Risk", key: "title", width: 34 }, { header: "Dept", key: "dept" }, { header: "P", key: "p", width: 5 }, { header: "I", key: "i", width: 5 }, { header: "Severity", key: "sev", width: 9 }, { header: "Trigger", key: "trigger", width: 30 }, { header: "Warning signs", key: "warn", width: 30 }, { header: "Prevention", key: "prev", width: 30 }, { header: "Immediate action", key: "act", width: 30 }, { header: "Plan B", key: "planb", width: 30 }, { header: "Owner", key: "owner", width: 20 }, { header: "Response (min)", key: "resp" }, { header: "Time impact h", key: "time" }, { header: "Cost impact", key: "cost", fmt: MONEY }, { header: "Status", key: "status" }],
    risks.map((r) => ({ id: r.code, title: r.title, dept: r.department?.key ?? null, p: r.probability, i: r.impact, sev: r.severity, trigger: r.trigger, warn: r.warningSigns, prev: r.prevention, act: r.immediateAction, planb: r.contingency, owner: r.owner?.name ?? null, resp: r.responseTimeMin, time: r.timeImpactHours, cost: num(r.costImpact), status: r.status })));
  if (include("16")) {
    const ws = table("16", "Budget_Summary", "Budget summary", [{ header: "Category", key: "cat" }, { header: "Description", key: "desc", width: 48 }, { header: "Qty", key: "q", fmt: N2 }, { header: "Unit", key: "u" }, { header: "Unit cost", key: "uc", fmt: MONEY }, { header: "Amount", key: "amt", fmt: MONEY }, { header: "Currency", key: "cur", width: 9 }, { header: "Basis", key: "basis", width: 16 }, { header: "Source", key: "src", width: 36 }],
      P.budget.lines.map((l) => ({ cat: l.category, desc: l.description, q: l.quantity, u: l.unit, uc: l.unitCost, amt: l.amount, cur: l.currency, basis: l.basis, src: l.source })), { note: "Totals are per currency. Conversions only with stored rates: " + (P.budget.conversions.map((c) => `1 ${c.from} = ${c.rate} ${c.to} (${c.source}, ${c.rateDate})`).join("; ") || "none") })!;
    const startRow = ws.rowCount + 2;
    P.budget.byCurrency.forEach((c, i) => {
      const r = ws.getRow(startRow + i);
      r.getCell(1).value = "TOTAL"; r.getCell(2).value = `Planned cost (${c.currency}) — formula sums the Amount column for this currency`;
      const first = 4, last = startRow - 2;
      r.getCell(6).value = { formula: `SUMIFS(F${first}:F${last},G${first}:G${last},"${c.currency}")`, result: c.total };
      r.getCell(6).numFmt = MONEY; r.getCell(7).value = c.currency; r.font = { bold: true };
    });
    const b = ws.getRow(startRow + P.budget.byCurrency.length + 1);
    b.getCell(1).value = "BUDGET"; b.getCell(6).value = P.budget.budgetAmount; b.getCell(6).numFmt = MONEY; b.getCell(7).value = P.budget.budgetCurrency; b.font = { bold: true };
    const vrow = ws.getRow(startRow + P.budget.byCurrency.length + 2);
    vrow.getCell(1).value = "VARIANCE"; vrow.getCell(2).value = P.budget.unconvertible.length ? `Not computable: no rate for ${P.budget.unconvertible.join(", ")}` : "Budget − planned total in budget currency"; vrow.getCell(6).value = P.budget.variance; vrow.getCell(6).numFmt = MONEY; vrow.font = { bold: true, color: { argb: (P.budget.variance ?? 0) < 0 ? "FFDC2626" : "FF16A34A" } };
    if (costs.length) { const h = ws.getRow(vrow.number + 2); h.getCell(1).value = "Entered costs / quotations / actuals"; h.font = { bold: true }; costs.forEach((c, i) => { const r = ws.getRow(h.number + 1 + i); r.getCell(1).value = c.category; r.getCell(2).value = c.description; r.getCell(6).value = Number(c.amount); r.getCell(6).numFmt = MONEY; r.getCell(7).value = c.currency; r.getCell(8).value = c.basis; }); }
  }
  table("17", "Site_Execution_Checklist", "Site execution checklist", [{ header: "✓", key: "chk", width: 5 }, { header: "WBS", key: "wbs", width: 8 }, { header: "Task", key: "name", width: 44 }, { header: "Planned start", key: "start", width: 16, fmt: DT }, { header: "Planned finish", key: "finish", width: 16, fmt: DT }, { header: "Crew", key: "crew" }, { header: "Critical", key: "critical", width: 9 }, { header: "Actual start", key: "aStart", width: 16, fmt: DT }, { header: "Actual finish", key: "aEnd", width: 16, fmt: DT }, { header: "Status", key: "status" }, { header: "Sign-off / notes", key: "sign", width: 30 }],
    ganttRows.filter((r) => ["TRANSPORT", "SETUP", "EVENT", "DISMANTLE"].includes(r.phase)).map((r) => ({ ...r, chk: r.status === "COMPLETED" ? "☑" : "☐", sign: "" })));
  if (include("18")) {
    const avp = await actualVsPlanned(projectId, fin);
    table("18", "Actual_vs_Planned", "Actual vs planned", [{ header: "Group", key: "group" }, { header: "Item", key: "description", width: 40 }, { header: "Unit", key: "unit" }, { header: "Planned", key: "planned", fmt: N2 }, { header: "Actual", key: "actual", fmt: N2 }, { header: "Variance", key: "variance", fmt: N2 }, { header: "Variance %", key: "vp", fmt: "0.0%" }, { header: "Accuracy %", key: "acc", fmt: "0.0%" }],
      avp.rows.map((r) => ({ ...r, vp: r.variancePct != null ? r.variancePct / 100 : null, acc: r.accuracyPct != null ? r.accuracyPct / 100 : null })), { note: "Accuracy = 1 − |actual − planned| ÷ planned. Failed estimates are shown, not hidden. Baseline: last approved plan." });
  }
  table("19", "Change_Log", "Change log", [{ header: "Date", key: "d", width: 16, fmt: DT }, { header: "Change", key: "title", width: 40 }, { header: "Entity", key: "entity" }, { header: "Fields", key: "fields", width: 40 }, { header: "Impact summary", key: "impact", width: 50 }, { header: "Status", key: "status" }, { header: "Requested by", key: "by", width: 20 }],
    changes.map((c) => ({ d: tz(c.createdAt), title: c.title, entity: c.entityType, fields: (fin ? (c.changes as { field: string; from: unknown; to: unknown }[]) : redactChangeEntries(c.changes as { field: string; from: unknown; to: unknown }[])).map((x) => `${x.field}: ${String(x.from ?? "—")} → ${String(x.to)}`).join("; "), impact: (c.impact as { summary?: string } | null)?.summary ?? null, status: c.status, by: users.get(c.requestedById ?? "") ?? null })));
  table("20", "Approvals", "Approvals", [{ header: "Requested", key: "d", width: 16, fmt: DT }, { header: "Type", key: "type" }, { header: "Item", key: "title", width: 50 }, { header: "Approver role", key: "role", width: 20 }, { header: "Status", key: "status", width: 18 }, { header: "Decided by", key: "by", width: 20 }, { header: "Decided", key: "dd", width: 16, fmt: DT }, { header: "Note", key: "note", width: 40 }],
    approvals.map((a) => ({ d: tz(a.createdAt), type: a.entityType, title: a.title, role: a.requiredRole, status: a.status, by: users.get(a.approverId ?? "") ?? null, dd: tz(a.decidedAt), note: a.decisionNote })));

  const safe = p.name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), fileName: `PARADIGM_EVENTOPS_${safe}_MASTER_PLAN${only ? `_${only.join("-")}` : ""}.xlsx` };
}
