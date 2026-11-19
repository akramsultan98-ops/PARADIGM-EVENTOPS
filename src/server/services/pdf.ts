import "server-only";
import path from "node:path";
import PDFDocument from "pdfkit";
import { BRAND } from "@/config/brand";

/** Branded A4 PDF helper (pdfkit standard fonts — Latin text; Arabic PDF rendering requires an embedded Arabic font, see docs). */
export function brandedPdf(title: string, subtitle: string, demo: boolean) {
  const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true, info: { Title: title, Author: BRAND.product, Creator: BRAND.product } });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((r) => doc.on("end", () => r(Buffer.concat(chunks))));
  const header = () => {
    doc.save().rect(0, 0, doc.page.width, 70).fill("#061520").restore();
    try { doc.image(path.join(process.cwd(), "public", BRAND.logo.fullWhite), 40, 10, { height: 50 }); } catch { /* optional */ }
    doc.fillColor("#00A8C8").fontSize(8).text(BRAND.product, 110, 18, { characterSpacing: 2 });
    doc.fillColor("#FFFFFF").fontSize(13).text(title, 110, 30, { width: doc.page.width - 150 });
    doc.fillColor("#A0DEF0").fontSize(8).text(subtitle, 110, 48, { width: doc.page.width - 150 });
    if (demo) doc.fillColor("#B45309").fontSize(7).text("DEMO DATA — NOT APPROVED PARADIGM COMPANY DATA", 40, 76);
    doc.fillColor("#111").fontSize(9);
    doc.y = 92;
  };
  header();
  doc.on("pageAdded", header);
  const h2 = (t: string) => { if (doc.y > doc.page.height - 100) doc.addPage(); doc.moveDown(0.6).fillColor("#061520").fontSize(12).text(t).moveDown(0.2).fillColor("#111").fontSize(9); doc.save().moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).strokeColor("#00A8C8").lineWidth(1).stroke().restore(); doc.moveDown(0.3); };
  const kv = (rows: [string, string][]) => rows.forEach(([k, v]) => { doc.font("Helvetica-Bold").text(`${k}: `, { continued: true }).font("Helvetica").text(v); });
  const tableRows = (cols: { h: string; w: number; align?: "left" | "right" }[], rows: string[][]) => {
    const x0 = 40;
    const drawRow = (cells: string[], bold = false) => {
      const hgt = Math.max(...cells.map((c, i) => doc.heightOfString(c ?? "", { width: cols[i].w - 4 }))) + 4;
      if (doc.y + hgt > doc.page.height - 50) { doc.addPage(); drawRow(cols.map((c) => c.h), true); }
      const y = doc.y;
      if (bold) doc.save().rect(x0, y - 1, cols.reduce((s, c) => s + c.w, 0), hgt).fill("#E8F6FA").restore();
      let x = x0;
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8).fillColor("#111");
      cells.forEach((c, i) => { doc.text(c ?? "", x + 2, y + 1, { width: cols[i].w - 4, align: cols[i].align ?? "left" }); x += cols[i].w; });
      doc.y = y + hgt;
    };
    drawRow(cols.map((c) => c.h), true);
    rows.forEach((r) => drawRow(r));
    doc.x = 40; doc.fontSize(9);
  };
  const finish = async () => {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) { doc.switchToPage(i); doc.fillColor("#7AAFC8").fontSize(7).text(`${BRAND.product} · ${BRAND.organization} · page ${i + 1} of ${range.count}`, 40, doc.page.height - 30, { align: "center", width: doc.page.width - 80, lineBreak: false }); }
    doc.end();
    return done;
  };
  return { doc, h2, kv, tableRows, finish };
}
