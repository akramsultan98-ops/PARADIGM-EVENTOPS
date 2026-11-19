import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db, num } from "@/lib/db";
import { projectScope } from "@/lib/scope";
import { brandedPdf } from "@/server/services/pdf";
import type { PlanResult } from "@/engines/pipeline";

export const runtime = "nodejs";
const f = (d: Date | number | null | undefined) => (d == null ? "—" : new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(d)));
const n = (v: number | null | undefined, d = 0) => (v == null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: d }).format(v));

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!u.permissions.has("export.run")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const p = await db.project.findFirst({ where: { ...projectScope(u), id }, include: { venue: true, projectManager: true } });
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const v = await db.scheduleVersion.findFirst({ where: { projectId: id, status: { not: "SUPERSEDED" } }, orderBy: { version: "desc" } });
  if (!v) return NextResponse.json({ error: "No plan generated" }, { status: 409 });
  const P = v.snapshot as unknown as PlanResult;
  const { doc, h2, kv, tableRows, finish } = brandedPdf(`${p.name} — Integrated Plan Report`, `${p.code} · plan v${v.version} (${v.status}) · generated ${new Date().toISOString().slice(0, 10)}`, p.isDemo);
  h2("Project summary");
  kv([["Client", p.client], ["Venue", `${p.venue?.name ?? "TBC"} (${p.location})`], ["Setup", `${f(p.setupStart)} → ${f(p.setupEnd)}`], ["Event", `${f(p.eventStart)} → ${f(p.eventEnd)}`], ["Participants", String(p.participants)], ["Project Manager", p.projectManager?.name ?? "—"], ["Readiness", `${P.readiness.errors} errors · ${P.readiness.warnings} warnings · schedule ${P.schedule.feasible ? "feasible" : "has conflicts"}`], ["Budget", `${n(num(p.budgetAmount))} ${p.currency} · planned ${n(P.budget.totalInBudgetCurrency)} ${p.currency} · variance ${n(P.budget.variance)}`]]);
  h2("Material BOQ");
  tableRows([{ h: "Material", w: 170 }, { h: "Items", w: 90 }, { h: "Net", w: 50, align: "right" }, { h: "Purchase", w: 55, align: "right" }, { h: "Unit", w: 55 }, { h: "State", w: 95 }], P.production.boq.map((b) => [b.name, b.itemCodes.join(", "), n(b.netQuantity, 2), n(b.purchaseQuantity, 2), b.unit, b.state]));
  h2("Manpower");
  tableRows([{ h: "Trade", w: 120 }, { h: "Phase", w: 80 }, { h: "Hours", w: 60, align: "right" }, { h: "Crew", w: 50, align: "right" }, { h: "Available", w: 60, align: "right" }, { h: "Shortfall", w: 60, align: "right" }, { h: "State", w: 85 }], P.trades.map((t) => [t.name, t.phase.toLowerCase(), n(t.totalHours, 1), String(t.requiredCrew), String(t.available), t.shortfall ? String(t.shortfall) : "—", t.state]));
  h2("Transport & AV");
  kv([["Fleet", P.logistics.trips.map((t) => `${t.vehicleCode} (${n(t.weightKg)} kg, ${n(t.volumeM3, 1)} m³)`).join("; ") || "—"], ["Backup vehicle", P.logistics.backupVehicle?.code ?? "none"], ["AV power", `${P.av.totalPowerKw} kW`], ["AV rentals", P.av.lines.filter((l) => l.rental).map((l) => `${l.rental} × ${l.model}`).join("; ") || "none"]]);
  h2("Schedule — key tasks");
  tableRows([{ h: "WBS", w: 35 }, { h: "Task", w: 230 }, { h: "Start", w: 90 }, { h: "Finish", w: 90 }, { h: "Critical", w: 70 }], P.tasks.filter((t) => t.critical || t.isMilestone || t.phase === "SETUP").map((t) => [t.wbsCode, t.name, f(t.start), f(t.finish), t.critical ? "yes" : ""]));
  h2("Open issues");
  P.issues.filter((i) => i.severity !== "info").slice(0, 40).forEach((i) => doc.text(`${i.severity === "error" ? "■" : "□"} [${i.department ?? "PMO"}] ${i.message}`));
  h2("Risks & contingency");
  tableRows([{ h: "ID", w: 35 }, { h: "Risk", w: 150 }, { h: "Level", w: 55 }, { h: "Plan B", w: 275 }], P.risks.map((r) => [r.code, r.title, `${r.level} (${r.severity})`, r.contingency]));
  doc.moveDown().fontSize(7).fillColor("#666").text("Calculated values come from deterministic engines with recorded formulas and assumptions (see Master Workbook sheet 06). Calculations are not engineering certifications: structural, electrical and rigging designs require approval by qualified professionals.");
  const pdf = await finish();
  await db.auditLog.create({ data: { companyId: u.companyId, userId: u.id, projectId: id, action: "PDF_EXPORTED", entityType: "Project", entityId: id } });
  return new NextResponse(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="PARADIGM_EVENTOPS_${p.code}_PLAN_REPORT.pdf"`, "cache-control": "no-store" } });
}
