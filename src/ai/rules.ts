/**
 * Deterministic rule-based extractor. Always available (no external service). It only extracts values
 * that are literally present in the text and records the evidence snippet for each.
 */
import type { AvDraftLine, Extraction, ProductionDraft } from "./types";

const WORDNUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, a: 1, an: 1, single: 1, first: 1, second: 2, third: 3, fourth: 4 };
const LEN: Record<string, number> = { mm: 0.001, millimeter: 0.001, millimeters: 0.001, cm: 0.01, centimeter: 0.01, centimeters: 0.01, m: 1, meter: 1, meters: 1, metre: 1, metres: 1, "متر": 1 };
const n = (s: string) => (WORDNUM[s.toLowerCase()] ?? Number(s.replace(",", ".")));

const CATEGORY: [RegExp, ProductionDraft["category"]][] = [
  [/backdrop|back ?drop|خلفية/i, "BACKDROP"], [/stage|منصة|مسرح/i, "STAGE"], [/podium|lectern|منبر/i, "PODIUM"], [/booth|stand\b|جناح/i, "BOOTH"],
  [/counter|reception desk|كاونتر/i, "COUNTER"], [/partition|wall|arch|gate|decor/i, "DECORATIVE"], [/sign(age)?|totem|لافتة/i, "SIGNAGE"], [/floor(ing)?|carpet|أرضية/i, "FLOORING"], [/table|chair|sofa|furniture/i, "FURNITURE"],
];
const MATERIAL: [RegExp, string][] = [[/\bmdf\b/i, "MDF"], [/plywood|ply\b/i, "Plywood"], [/timber|wooden|wood|خشب/i, "Timber / wood"], [/alumin(i)?um/i, "Aluminium"], [/steel|metal/i, "Metal"], [/acrylic|plexi/i, "Acrylic"], [/fabric|lycra/i, "Fabric"], [/foam ?board|forex|pvc/i, "PVC / foam board"]];

export function extractRuleBased(text: string): Extraction {
  const t = text.replace(/\s+/g, " ").trim();
  const evidence: Extraction["evidence"] = [];
  const ev = (field: string, m: RegExpExecArray | null) => { if (m) evidence.push({ field, snippet: m[0].trim() }); };
  const lower = t.toLowerCase();

  const isAv = /\b(led|screen|speaker|microphone|mic|projector|lighting|moving head|mixer|console|truss|interpret|headset|camera)/i.test(t);
  const isProd = CATEGORY.some(([re]) => re.test(t)) || /\b(mdf|plywood|timber|carpentr|paint)/i.test(t);
  const isAcc = /\b(hotel|room|check[- ]?in|check[- ]?out|rooming|accommodation)/i.test(t);

  const production: ProductionDraft[] = [];
  if (isProd) {
    const d: ProductionDraft = { name: null, category: null, quantity: null, widthM: null, heightM: null, depthM: null, material: null, thicknessMm: null, finishing: null, color: null, paintCoats: null, constructionMethod: null, installationDay: null, notes: null };
    for (const [re, cat] of CATEGORY) { const m = re.exec(t); if (m) { d.category = cat; ev("category", m); break; } }
    const U = "(mm|cm|m|meters?|metres?|centimeters?|millimeters?|متر)";
    const NUM = "(\\d+(?:[.,]\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|twelve)";
    const dim = (word: RegExp) => { const re = new RegExp(`${NUM}[\\s-]*${U}?[\\s-]*(?:${word.source})`, "i"); const m = re.exec(t); return m ? { v: n(m[1]) * (LEN[(m[2] ?? "m").toLowerCase()] ?? 1), m } : null; };
    const w = dim(/wide|width|long|length|عرض/), h = dim(/high|height|tall|ارتفاع/), dp = dim(/deep|depth|thick(?! ?mm)|عمق/);
    if (w) { d.widthM = round(w.v); ev("widthM", w.m); }
    if (h) { d.heightM = round(h.v); ev("heightM", h.m); }
    if (dp) { d.depthM = round(dp.v); ev("depthM", dp.m); }
    // "8 x 3 m" / "8m × 3m × 0.3m"
    const xm = new RegExp(`${NUM}\\s*${U}?\\s*[x×*]\\s*${NUM}\\s*${U}?(?:\\s*[x×*]\\s*${NUM}\\s*${U}?)?`, "i").exec(t);
    if (xm && d.widthM == null && d.heightM == null) {
      const unit = (i: number) => LEN[(xm[i] ?? xm[4] ?? xm[6] ?? "m").toLowerCase()] ?? 1;
      d.widthM = round(n(xm[1]) * unit(2)); d.heightM = round(n(xm[3]) * unit(4)); if (xm[5]) d.depthM = round(n(xm[5]) * unit(6)); ev("dimensions", xm);
    }
    for (const [re, mat] of MATERIAL) { const m = re.exec(t); if (m) { d.material = mat; ev("material", m); break; } }
    const th = /(\d+(?:\.\d+)?)\s*mm\s*(?:thick|mdf|ply|board)?/i.exec(t);
    if (th && /mdf|ply|board|thick/i.test(t.slice(Math.max(0, th.index - 20), th.index + th[0].length + 20))) { d.thicknessMm = Number(th[1]); ev("thicknessMm", th); }
    const paint = /(painted|paint|spray(?:ed)?|lacquer(?:ed)?)\s+(?:in\s+)?(matte |gloss |satin )?(black|white|grey|gray|red|blue|gold|silver|[a-z]+)?/i.exec(t);
    if (paint) { d.finishing = paint[0].trim(); if (paint[3]) d.color = paint[3]; ev("finishing", paint); }
    const wrap = /(vinyl wrap|vinyl|carpet(?:ed)?|fabric (?:cover|wrap)|laminate)/i.exec(t);
    if (!d.finishing && wrap) { d.finishing = wrap[0]; ev("finishing", wrap); }
    const coats = /(\d+|one|two|three)\s+coats?/i.exec(t);
    if (coats) { d.paintCoats = n(coats[1]); ev("paintCoats", coats); }
    const day = /(first|second|third|fourth|1st|2nd|3rd|day\s*(\d))\s*(?:setup|set-up|installation)?\s*day|setup day\s*(\d)|day\s*(\d)\s*of\s*setup/i.exec(t);
    if (day) { const v = day[2] ?? day[3] ?? day[4] ?? day[1].replace(/(st|nd|rd)$/, ""); d.installationDay = n(v); ev("installationDay", day); }
    const qty = /(\d+|two|three|four|five|six|ten|twelve)\s*(?:x\s*)?(?:pcs|pieces|units|identical|nos?\.?)?\s*(?:backdrops|stages|podiums|counters|booths|signs|partitions|walls|tables)\b/i.exec(t);
    if (qty) { d.quantity = n(qty[1]); ev("quantity", qty); }
    const method = /(?:built|constructed|made)\s+(?:as|with|from|using)\s+([^.,;]+)/i.exec(t);
    if (method) { d.constructionMethod = method[1].trim(); ev("constructionMethod", method); }
    d.name = [d.category ? d.category.charAt(0) + d.category.slice(1).toLowerCase().replace("_", " ") : "Item", d.widthM && d.heightM ? `${d.widthM} × ${d.heightM} m` : ""].join(" ").trim();
    const label = /(?:for|in) the ([a-z ]{3,30}?)(?:,|\.| area| lounge| hall| entrance)/i.exec(t);
    if (label) d.notes = `Location/purpose: ${label[1].trim()}`;
    production.push(d);
  }

  const av: AvDraftLine[] = [];
  if (isAv) {
    const AV: [RegExp, string][] = [[/led (?:panels?|cabinets?|tiles?)/i, "LED_SCREEN"], [/led (?:screen|wall)/i, "LED_SCREEN"], [/wireless (?:hand ?held )?microphones?|mics?/i, "MICROPHONE"], [/lapel|lavalier/i, "MICROPHONE"], [/speakers?|line ?arrays?/i, "SPEAKER"], [/subwoofers?|subs\b/i, "SOUND_SYSTEM"], [/moving heads?/i, "LIGHTING_FIXTURE"], [/pars?\b|wash lights?/i, "LIGHTING_FIXTURE"], [/projectors?/i, "PROJECTOR"], [/truss(?:es|ing)?/i, "TRUSS"], [/interpretation booths?/i, "INTERPRETATION"], [/headsets?/i, "HEADSET"], [/cameras?/i, "CAMERA"], [/mix(?:ing)? (?:console|desk)|mixer/i, "MIXING_CONSOLE"]];
    for (const [re, cat] of AV) {
      const m = new RegExp(`(\\d+|two|three|four|five|six|eight|ten|twelve)\\s*(?:x\\s*)?(?:[a-z-]+\\s){0,2}(${re.source})(?:[^.,;]*?(?:\\+|plus|and)\\s*(\\d+)\\s*(?:spare|backup))?`, "i").exec(t);
      if (m) { av.push({ description: m[0].trim(), category: cat, quantity: n(m[1]), backupQuantity: m[m.length - 1] ? Number(m[m.length - 1]) : null, modelHint: null }); ev(`av.${cat}`, m); }
    }
  }
  const department: Extraction["department"] = isProd && !isAv ? "PRODUCTION" : isAv && !isProd ? "AV" : isAcc ? "ACCOMMODATION" : isProd ? "PRODUCTION" : "OTHER";
  void lower;
  return { department, production, av, evidence, assumptionsMade: ["Rule-based extraction: only values literally stated in the text were captured"], engine: "RULE_BASED" };
}

const round = (v: number) => Math.round(v * 1000) / 1000;
