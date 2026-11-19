"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import Papa from "papaparse";
import { db } from "@/lib/db";
import { assertCan, requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { maxUploadBytes, validateUpload } from "@/server/storage";
import { assertDeclaredSize, FILE_LIMITS, inspectZip, withTimeout } from "@/server/services/file-safety";
import { run } from "./_util";

const IMPORT_TARGETS = {
  materials: { label: "Materials", fields: ["code", "name", "category", "unit", "stockLengthM", "stockWidthM", "thicknessMm", "weightPerUnitKg", "coverageM2PerL", "wasteFactorPct", "kerfMm", "edgeTrimMm", "unitCost", "currency", "stockQty"], required: ["code", "name", "category", "unit"], key: "code" },
  vendors: { label: "Vendors", fields: ["name", "contactName", "phone", "email", "location", "services", "leadTimeDays"], required: ["name"], key: "name" },
  equipment: { label: "Equipment", fields: ["code", "category", "model", "manufacturer", "weightKg", "caseVolumeM3", "powerW", "setupMinutes", "techniciansRequired", "rentalDailyRate", "quantity"], required: ["code", "category", "model"], key: "code" },
  historical: { label: "Historical events (metrics)", fields: ["event", "date", "location", "participants", "category", "planned", "actual", "unit", "lessons"], required: ["event", "category", "planned", "actual", "unit"], key: "event" },
} as const;
type Target = keyof typeof IMPORT_TARGETS;

async function parseFile(file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  assertDeclaredSize(file, maxUploadBytes());
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = validateUpload(file.name, file.type, buf);
  if (mime.includes("openxmlformats")) inspectZip(buf);
  return withTimeout(parseBuffer(buf, mime), FILE_LIMITS.parseTimeoutMs, "Import parsing");
}

async function parseBuffer(buf: Buffer, mime: string): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  if (mime === "text/csv" || mime === "text/plain") {
    const r = Papa.parse<Record<string, string>>(buf.toString("utf8"), { header: true, skipEmptyLines: true });
    return { headers: r.meta.fields ?? [], rows: r.data.slice(0, 5000) };
  }
  if (mime.includes("spreadsheetml")) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    const headers = ((ws.getRow(1).values as unknown[]) ?? []).slice(1).map((v) => String(v ?? "").trim());
    const rows: Record<string, string>[] = [];
    ws.eachRow((row, i) => { if (i === 1 || rows.length >= 5000) return; const vals = (row.values as unknown[]).slice(1); rows.push(Object.fromEntries(headers.map((h, j) => [h, vals[j] == null ? "" : typeof vals[j] === "object" ? String((vals[j] as { result?: unknown }).result ?? "") : String(vals[j])]))); });
    return { headers, rows };
  }
  throw new Error("Import accepts CSV or XLSX files");
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export async function previewImportAction(form: FormData) {
  return run(async () => {
    const u = await requireUser();
    assertCan(u, "knowledge.manage");
    const target = String(form.get("target")) as Target;
    if (!IMPORT_TARGETS[target]) throw new Error("Unknown import target");
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("No file");
    const { headers, rows } = await parseFile(file);
    const mapping = Object.fromEntries(IMPORT_TARGETS[target].fields.map((f) => [f, headers.find((h) => norm(h) === norm(f)) ?? headers.find((h) => norm(h).includes(norm(f)) || norm(f).includes(norm(h))) ?? ""]));
    return { headers, rows, mapping, total: rows.length };
  });
}

const commitSchema = z.object({ target: z.enum(["materials", "vendors", "equipment", "historical"]), mapping: z.record(z.string(), z.string()), rows: z.array(z.record(z.string(), z.string())).max(5000), skipDuplicates: z.boolean().default(true) });

export async function commitImportAction(input: z.input<typeof commitSchema>) {
  return run(async () => {
    const u = await requireUser();
    assertCan(u, "knowledge.manage");
    const d = commitSchema.parse(input);
    const T = IMPORT_TARGETS[d.target];
    for (const r of T.required) if (!d.mapping[r]) throw new Error(`Map a column to required field "${r}"`);
    const get = (row: Record<string, string>, f: string) => (d.mapping[f] ? String(row[d.mapping[f]] ?? "").trim() : "");
    const numv = (v: string) => (v === "" ? null : Number(v.replace(/,/g, "")));
    const errors: string[] = [];
    let created = 0, duplicates = 0;
    if (d.target === "materials") {
      const existing = new Set((await db.material.findMany({ where: { companyId: u.companyId }, select: { code: true } })).map((m) => m.code.toUpperCase()));
      const cats = ["BOARD", "TIMBER", "PAINT", "PRIMER", "FASTENER", "ADHESIVE", "VINYL", "FABRIC", "FLOORING", "CARPET", "METAL", "OTHER"];
      for (const [i, row] of d.rows.entries()) {
        const code = get(row, "code").toUpperCase(), cat = get(row, "category").toUpperCase();
        if (!code || !get(row, "name")) { errors.push(`Row ${i + 2}: code and name required`); continue; }
        if (!cats.includes(cat)) { errors.push(`Row ${i + 2}: unknown category "${cat}"`); continue; }
        const nums = ["stockLengthM", "stockWidthM", "thicknessMm", "weightPerUnitKg", "coverageM2PerL", "wasteFactorPct", "kerfMm", "edgeTrimMm", "unitCost", "stockQty"].map((f) => [f, numv(get(row, f))] as const);
        const bad = nums.find(([, v]) => v !== null && (Number.isNaN(v) || v < 0));
        if (bad) { errors.push(`Row ${i + 2}: invalid number for ${bad[0]}`); continue; }
        if (existing.has(code)) { duplicates++; if (d.skipDuplicates) continue; }
        const n = Object.fromEntries(nums) as Record<string, number | null>;
        await db.material.upsert({ where: { companyId_code: { companyId: u.companyId, code } }, create: { companyId: u.companyId, code, name: get(row, "name"), category: cat as never, unit: get(row, "unit") || "unit", stockLengthM: n.stockLengthM, stockWidthM: n.stockWidthM, thicknessMm: n.thicknessMm, weightPerUnitKg: n.weightPerUnitKg, coverageM2PerL: n.coverageM2PerL, wasteFactorPct: n.wasteFactorPct ?? 0, kerfMm: n.kerfMm, edgeTrimMm: n.edgeTrimMm, unitCost: n.unitCost, currency: get(row, "currency") || "EGP", stockQty: n.stockQty, status: "PENDING" }, update: { name: get(row, "name"), unitCost: n.unitCost, stockQty: n.stockQty, status: "PENDING" } });
        existing.add(code); created++;
      }
    } else if (d.target === "vendors") {
      const existing = new Set((await db.vendor.findMany({ where: { companyId: u.companyId }, select: { name: true } })).map((v) => v.name.toLowerCase()));
      for (const [i, row] of d.rows.entries()) {
        const name = get(row, "name");
        if (!name) { errors.push(`Row ${i + 2}: name required`); continue; }
        if (existing.has(name.toLowerCase())) { duplicates++; continue; }
        await db.vendor.create({ data: { companyId: u.companyId, name, contactName: get(row, "contactName") || null, phone: get(row, "phone") || null, email: get(row, "email") || null, location: get(row, "location") || null, services: get(row, "services").split(/[;,]/).map((s) => s.trim()).filter(Boolean), leadTimeDays: numv(get(row, "leadTimeDays")), status: "PENDING" } });
        existing.add(name.toLowerCase()); created++;
      }
    } else if (d.target === "equipment") {
      const existing = new Set((await db.equipment.findMany({ where: { companyId: u.companyId }, select: { code: true } })).map((e) => e.code.toUpperCase()));
      for (const [i, row] of d.rows.entries()) {
        const code = get(row, "code").toUpperCase();
        if (!code || !get(row, "model")) { errors.push(`Row ${i + 2}: code and model required`); continue; }
        if (existing.has(code)) { duplicates++; continue; }
        await db.equipment.create({ data: { companyId: u.companyId, code, category: (get(row, "category").toUpperCase() || "OTHER") as never, model: get(row, "model"), manufacturer: get(row, "manufacturer") || null, weightKg: numv(get(row, "weightKg")), caseVolumeM3: numv(get(row, "caseVolumeM3")), powerW: numv(get(row, "powerW")), setupMinutes: numv(get(row, "setupMinutes")), techniciansRequired: numv(get(row, "techniciansRequired")), rentalDailyRate: numv(get(row, "rentalDailyRate")), status: "PENDING", inventory: { create: { location: "Imported", quantity: Number(numv(get(row, "quantity")) ?? 0) } } } }).catch((e) => errors.push(`Row ${i + 2}: ${e instanceof Error && /enum/i.test(e.message) ? "unknown equipment category" : "invalid data"}`));
        existing.add(code); created++;
      }
    } else {
      const byEvent = new Map<string, Record<string, string>[]>();
      for (const row of d.rows) { const e = get(row, "event"); if (e) byEvent.set(e, [...(byEvent.get(e) ?? []), row]); }
      for (const [event, rows] of byEvent) {
        if (await db.historicalEvent.findFirst({ where: { companyId: u.companyId, name: event } })) { duplicates++; continue; }
        await db.historicalEvent.create({ data: { companyId: u.companyId, name: event, eventDate: get(rows[0], "date") ? new Date(get(rows[0], "date")) : null, location: get(rows[0], "location") || null, participants: numv(get(rows[0], "participants")), lessonsLearned: get(rows[0], "lessons") || null, metrics: rows.map((r) => ({ category: get(r, "category"), planned: numv(get(r, "planned")), actual: numv(get(r, "actual")), unit: get(r, "unit") })) } });
        created++;
      }
    }
    await audit({ companyId: u.companyId, userId: u.id, action: "KNOWLEDGE_IMPORT", entityType: d.target, details: { created, duplicates, errors: errors.length } });
    revalidatePath("/knowledge");
    return { created, duplicates, errors: errors.slice(0, 50) };
  });
}

/** Propose a productivity-rate change. Only a Super Admin can approve; nothing changes until then. */
export async function proposeRateChangeAction(laborKey: string, activity: string, unitOfWork: string, hoursPerUnit: number, evidence: string) {
  return run(async () => {
    const u = await requireUser();
    assertCan(u, "standards.manage");
    const d = z.object({ laborKey: z.string(), activity: z.string().regex(/^[A-Z_]+$/), unitOfWork: z.string().min(1).max(10), hoursPerUnit: z.number().positive().max(100), evidence: z.string().min(5).max(1000) }).parse({ laborKey, activity, unitOfWork, hoursPerUnit, evidence });
    const cat = await db.laborCategory.findFirstOrThrow({ where: { companyId: u.companyId, key: d.laborKey }, include: { rates: true } });
    const from = cat.rates.find((r) => r.activity === d.activity)?.hoursPerUnit ?? null;
    const key = `PROPOSAL:${d.laborKey}:${d.activity}`;
    const last = await db.companyStandard.findFirst({ where: { companyId: u.companyId, key }, orderBy: { version: "desc" } });
    const s = await db.companyStandard.create({ data: { companyId: u.companyId, key, category: "Labour", label: `Proposed: ${cat.name} ${d.activity.toLowerCase().replace(/_/g, " ")} productivity`, value: { activity: d.activity, from, to: d.hoursPerUnit, unit: `h/${d.unitOfWork}`, evidence: d.evidence }, unit: `h/${d.unitOfWork}`, status: "PENDING", version: (last?.version ?? 0) + 1, proposedBy: u.id, description: d.evidence } });
    await db.approval.create({ data: { companyId: u.companyId, entityType: "STANDARD", entityId: s.id, title: `Standards change: ${cat.name} ${d.activity.toLowerCase().replace(/_/g, " ")} ${from ?? "—"} → ${d.hoursPerUnit} h/${d.unitOfWork}`, description: d.evidence, requiredRole: "SUPER_ADMIN", requestedById: u.id } });
    await notify({ roles: ["SUPER_ADMIN"] }, { companyId: u.companyId, type: "APPROVAL", title: "Company standards change proposed", body: s.label, link: "/approvals" });
    await audit({ companyId: u.companyId, userId: u.id, action: "STANDARD_PROPOSED", entityType: "CompanyStandard", entityId: s.id, details: d });
    revalidatePath("/knowledge");
  }, "Proposal sent to the Super Admin for approval");
}
