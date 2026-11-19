import "server-only";
import { cookies } from "next/headers";
import { ar, en, STATUS_LABELS, type Dict } from "./dictionaries";

export type Locale = "en" | "ar";
export const LOCALE_COOKIE = "peo_locale";

export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return v === "ar" ? "ar" : "en";
}
export async function getDict(): Promise<{ t: Dict; locale: Locale; dir: "ltr" | "rtl" }> {
  const locale = await getLocale();
  return { t: locale === "ar" ? ar : en, locale, dir: locale === "ar" ? "rtl" : "ltr" };
}
export function statusLabel(s: string, locale: Locale) {
  return STATUS_LABELS[s]?.[locale] ?? s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}
