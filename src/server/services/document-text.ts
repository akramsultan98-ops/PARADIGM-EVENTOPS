import "server-only";
import { FILE_LIMITS, inspectZip, withTimeout } from "./file-safety";

/** Text extraction for uploaded documents (PDF per page, DOCX, CSV, XLSX). Images return no text (vision requires the AI provider). */
/** Bounded (P2-G): ZIP-based files are inspected before inflating, PDFs are capped by page count, all parsing times out. */
export async function extractDocumentText(buf: Buffer, mime: string): Promise<{ pages: string[]; preview: string | null }> {
  if (mime.includes("openxmlformats")) inspectZip(buf); // throws on archive bombs before any parser runs
  return withTimeout(extract(buf, mime), FILE_LIMITS.parseTimeoutMs, "Text extraction");
}

async function extract(buf: Buffer, mime: string): Promise<{ pages: string[]; preview: string | null }> {
  if (mime === "application/pdf") {
    const { getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const n = Math.min(pdf.numPages, FILE_LIMITS.maxPdfPages);
    const pages: string[] = [];
    for (let i = 1; i <= n; i++) {
      const content = await (await pdf.getPage(i)).getTextContent();
      pages.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" ").replace(/\s+/g, " ").trim().slice(0, 50000));
    }
    if (pdf.numPages > n) pages.push(`[${pdf.numPages - n} further page(s) not processed — limit ${FILE_LIMITS.maxPdfPages}]`);
    return { pages, preview: pages.join(" ").slice(0, 1000) || null };
  }
  if (mime.includes("wordprocessingml")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return { pages: [value], preview: value.slice(0, 1000) };
  }
  if (mime === "text/csv" || mime === "text/plain") {
    const t = buf.toString("utf8");
    return { pages: [t.slice(0, 200000)], preview: t.slice(0, 1000) };
  }
  if (mime.includes("spreadsheetml")) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const pages = wb.worksheets.slice(0, 20).map((ws) => { const rows: string[] = []; ws.eachRow({ includeEmpty: false }, (r) => rows.push((r.values as unknown[]).slice(1).map((v) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v))).join(" | "))); return rows.slice(0, 2000).join("\n"); });
    return { pages, preview: pages.join("\n").slice(0, 1000) };
  }
  return { pages: [], preview: null };
}
