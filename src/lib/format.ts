/** Formatting helpers — Africa/Cairo by default; never mixes currencies. */
const TZ = "Africa/Cairo";

export function fmtNumber(n: number | null | undefined, digits = 0, locale = "en") {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
}
export function fmtMoney(n: number | null | undefined, currency = "EGP", locale = "en") {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US", { maximumFractionDigits: 0 }).format(n)} ${currency}`;
}
export function fmtDate(d: Date | string | number | null | undefined, locale = "en", opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" }) {
  if (d === null || d === undefined) return "—";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", { timeZone: TZ, ...opts }).format(new Date(d));
}
export function fmtDateTime(d: Date | string | number | null | undefined, locale = "en") {
  return fmtDate(d, locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}
export function fmtTime(d: Date | string | number | null | undefined, locale = "en") {
  return fmtDate(d, locale, { hour: "2-digit", minute: "2-digit", hour12: false });
}
export function fmtRelative(d: Date | string, now = new Date()) {
  const diff = (new Date(d).getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}
export function daysUntil(d: Date | string, now = new Date()) {
  return Math.ceil((new Date(d).getTime() - now.getTime()) / 86400000);
}
/** datetime-local input value in Cairo time */
export function toLocalInput(d: Date | string | null | undefined) {
  if (!d) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(d));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}`;
}
/** parse datetime-local (Cairo, UTC+2 — Egypt observes DST Apr–Oct; offset resolved via Intl) */
export function fromLocalInput(v: string): Date {
  const [date, time = "00:00"] = v.split("T");
  const guess = new Date(`${date}T${time}:00Z`);
  const tzName = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" }).formatToParts(guess).find((p) => p.type === "timeZoneName")?.value ?? "GMT+2";
  const m = /GMT([+-]\d+)/.exec(tzName);
  const off = m ? Number(m[1]) : 2;
  return new Date(guess.getTime() - off * 3600000);
}
