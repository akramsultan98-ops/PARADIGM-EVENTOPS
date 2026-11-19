import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projectScope } from "@/lib/scope";
import { buildWorkbook, SHEET_GROUPS } from "@/server/services/workbook";
import { canReadFinancials } from "@/lib/financial";

export const runtime = "nodejs";
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!u.permissions.has("export.run")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const p = await db.project.findFirst({ where: { ...projectScope(u), id } });
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const group = new URL(req.url).searchParams.get("sheets");
  try {
    if (group === "budget" && !canReadFinancials(u)) return NextResponse.json({ error: "Forbidden — budget.read required" }, { status: 403 });
    const { buffer, fileName } = await buildWorkbook(u.companyId, id, group ? SHEET_GROUPS[group] : undefined, { includeFinancials: canReadFinancials(u) });
    await db.auditLog.create({ data: { companyId: u.companyId, userId: u.id, projectId: id, action: "WORKBOOK_EXPORTED", entityType: "Project", entityId: id, details: { group, includeFinancials: canReadFinancials(u) } } });
    return new NextResponse(new Uint8Array(buffer), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${fileName}"`, "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Export failed" }, { status: 409 });
  }
}
