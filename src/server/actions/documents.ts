"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertCan, requireUser } from "@/lib/auth/session";
import { projectScope } from "@/lib/scope";
import { audit } from "@/lib/audit";
import { maxUploadBytes, newStorageKey, sha256, storage, validateUpload } from "@/server/storage";
import { assertDeclaredSize, inspectZip } from "@/server/services/file-safety";
import { extractDocumentText } from "@/server/services/document-text";
import { extractRuleBased } from "@/ai/rules";
import { rateLimit } from "@/lib/rate-limit";
import { run } from "./_util";

const CATEGORIES = ["DRAWING", "SPEC", "QUOTE", "PHOTO", "ARTWORK", "BOQ", "CONTRACT", "GENERAL"];

/** Secure upload: type/size/magic-byte validation, hashed storage key, text extraction, and DRAFT extracted data for human review. */
export async function uploadDocumentAction(form: FormData) {
  return run(async () => {
    const u = await requireUser();
    assertCan(u, "documents.upload");
    if (!rateLimit(`upload:${u.id}`, 30, 10 * 60_000)) throw new Error("Upload limit reached — try again later");
    const file = form.get("file");
    const projectId = String(form.get("projectId") ?? "") || null;
    const category = CATEGORIES.includes(String(form.get("category"))) ? String(form.get("category")) : "GENERAL";
    const taskId = String(form.get("taskId") ?? "") || null;
    if (!(file instanceof File)) throw new Error("No file provided");
    assertDeclaredSize(file, maxUploadBytes()); // before the body is copied into a Buffer
    if (projectId) await db.project.findFirstOrThrow({ where: { ...projectScope(u), id: projectId } });
    if (taskId && !projectId) throw new Error("A task photo must belong to a project");
    if (taskId) await db.task.findFirstOrThrow({ where: { id: taskId, projectId: projectId! } }).catch(() => { throw new Error("Task does not belong to this project"); });
    const buf = Buffer.from(await file.arrayBuffer());
    const mime = validateUpload(file.name, file.type, buf);
    if (mime.includes("openxmlformats")) inspectZip(buf); // every check happens BEFORE anything is written to storage (Codex P2)
    const text = await extractDocumentText(buf, mime).catch(() => ({ pages: [] as string[], preview: null as string | null }));
    const key = newStorageKey(u.companyId, file.name);
    await storage().put(key, buf, mime);
    // the stored file is tracked by its UploadedDocument row; if that cannot be created, remove the file again
    const doc = await db.uploadedDocument.create({ data: { companyId: u.companyId, projectId, uploadedById: u.id, fileName: file.name.slice(0, 200), mimeType: mime, sizeBytes: buf.length, storageKey: key, sha256: sha256(buf), category, textPreview: text.preview?.slice(0, 1000) ?? null } }).catch(async (e) => { await storage().remove(key); throw e; });
    let extracted = 0;
    for (const [i, pageText] of text.pages.slice(0, 200).entries()) {
      const ex = extractRuleBased(pageText);
      const rows = ex.evidence.slice(0, 40).map((e) => ({ documentId: doc.id, page: text.pages.length > 1 ? i + 1 : null, field: e.field, value: e.snippet, snippet: e.snippet, method: "RULE_BASED" as const, state: "UNDER_REVIEW" as const }));
      if (rows.length) { await db.extractedDocumentData.createMany({ data: rows }); extracted += rows.length; }
    }
    if (category === "PHOTO" && projectId) await db.executionUpdate.create({ data: { projectId, taskId, userId: u.id, type: "PHOTO", message: `Site photo: ${file.name}`, photoDocumentId: doc.id } });
    await audit({ companyId: u.companyId, userId: u.id, projectId, action: "DOCUMENT_UPLOADED", entityType: "UploadedDocument", entityId: doc.id, details: { fileName: file.name, mime, size: buf.length, extracted } });
    revalidatePath("/documents");
    if (projectId) revalidatePath(`/projects/${projectId}/documents`);
    return { id: doc.id, extracted };
  }, "Document uploaded");
}

export async function reviewExtractedAction(id: string, decision: "APPROVED" | "REJECTED") {
  return run(async () => {
    const u = await requireUser();
    assertCan(u, "submission.review");
    if (!["APPROVED", "REJECTED"].includes(decision)) throw new Error("Invalid decision");
    const row = await db.extractedDocumentData.findFirstOrThrow({ where: { id, document: { companyId: u.companyId, deletedAt: null, OR: [{ projectId: null }, { project: projectScope(u) }] } } });
    await db.extractedDocumentData.update({ where: { id }, data: { state: decision, reviewedById: u.id, reviewedAt: new Date() } });
    await audit({ companyId: u.companyId, userId: u.id, action: `EXTRACTION_${decision}`, entityType: "ExtractedDocumentData", entityId: id, details: { field: row.field, value: row.value } });
    revalidatePath("/documents");
  }, "Extraction reviewed");
}
