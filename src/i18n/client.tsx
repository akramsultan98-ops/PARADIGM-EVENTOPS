"use client";
import { createContext, useContext } from "react";
import { en, STATUS_LABELS, type Dict } from "./dictionaries";

const Ctx = createContext<{ t: Dict; locale: "en" | "ar"; dir: "ltr" | "rtl" }>({ t: en, locale: "en", dir: "ltr" });
export function I18nProvider({ value, children }: { value: { t: Dict; locale: "en" | "ar"; dir: "ltr" | "rtl" }; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useI18n = () => useContext(Ctx);
export function useStatusLabel() {
  const { locale } = useI18n();
  return (s: string) => STATUS_LABELS[s]?.[locale] ?? s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}
