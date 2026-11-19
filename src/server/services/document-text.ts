import "server-only";

/** Text extraction for uploaded documents (PDF per page, DOCX, CSV, XLSX). Images return no text (vision requires the AI provider). */
export async function extractDocumentText(buf: Buffer, mime: string): Promise<{ pages: string[]; preview: string | null }> {
  if (mime === "application/pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = (Array.isArray(text) ? text : [text]).map((t) => t.replace(/\s+/g, " ").trim());
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
    const pages = wb.worksheets.map((ws) => { const rows: string[] = []; ws.eachRow({ includeEmpty: false }, (r) => rows.push((r.values as unknown[]).slice(1).map((v) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v))).join(" | "))); return rows.slice(0, 2000).join("\n"); });
    return { pages, preview: pages.join("\n").slice(0, 1000) };
  }
  return { pages: [], preview: null };
}
