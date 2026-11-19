import { NextResponse } from "next/server";
import Papa from "papaparse";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projectScope } from "@/lib/scope";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!u.permissions.has("export.run")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const p = await db.project.findFirst({ where: { ...projectScope(u), id } });
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const tasks = await db.task.findMany({ where: { projectId: id }, include: { department: true }, orderBy: { plannedStart: "asc" } });
  // neutralise spreadsheet formula injection in text cells
  const safe = (s: string | null) => (s && /^[=+\-@]/.test(s) ? `'${s}` : s);
  const csv = Papa.unparse(tasks.map((t) => ({ wbs: t.wbsCode, task: safe(t.name), phase: t.phase, department: t.department?.key ?? "", planned_start_utc: t.plannedStart?.toISOString() ?? "", planned_end_utc: t.plannedEnd?.toISOString() ?? "", duration_h: t.durationHours, crew: t.crewSize ?? "", critical: t.isCritical, status: t.status, percent: t.percentComplete })));
  return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${p.code}_tasks.csv"` } });
}
