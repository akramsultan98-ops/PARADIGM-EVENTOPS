import { NextResponse } from "next/server";
import Papa from "papaparse";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET() {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!u.permissions.has("audit.read")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const logs = await db.auditLog.findMany({ where: { companyId: u.companyId }, include: { user: { select: { email: true } }, project: { select: { code: true } } }, orderBy: { createdAt: "desc" }, take: 5000 });
  const csv = Papa.unparse(logs.map((l) => ({ time_utc: l.createdAt.toISOString(), user: l.user?.email ?? "system", project: l.project?.code ?? "", action: l.action, entity: l.entityType, entity_id: l.entityId ?? "", ip: l.ip ?? "", details: JSON.stringify(l.details ?? {}) })));
  return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="audit_log.csv"` } });
}
