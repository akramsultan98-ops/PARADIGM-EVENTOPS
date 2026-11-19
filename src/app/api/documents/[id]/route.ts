import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projectScope } from "@/lib/scope";
import { storage } from "@/server/storage";

export const runtime = "nodejs";
/** Authorised download: company + project scope enforced; inline only for images/PDF, never HTML. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const d = await db.uploadedDocument.findFirst({ where: { id, companyId: u.companyId, deletedAt: null, OR: [{ projectId: null }, { project: projectScope(u) }] } });
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const buf = await storage().get(d.storageKey).catch(() => null);
  if (!buf) return NextResponse.json({ error: "File missing from storage" }, { status: 410 });
  const inline = d.mimeType === "application/pdf" || d.mimeType.startsWith("image/");
  return new NextResponse(new Uint8Array(buf), { headers: { "content-type": d.mimeType, "content-disposition": `${inline ? "inline" : "attachment"}; filename="${d.fileName.replace(/[^\w.\- ]/g, "_")}"`, "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'", "cache-control": "private, no-store" } });
}
