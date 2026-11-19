"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastItem = { id: number; title: string; description?: string; tone: "success" | "error" | "info" };
let push: ((t: Omit<ToastItem, "id">) => void) | null = null;
export function toast(title: string, opts: { description?: string; tone?: ToastItem["tone"] } = {}) { push?.({ title, description: opts.description, tone: opts.tone ?? "success" }); }

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    push = (t) => {
      const id = Date.now() + Math.random();
      setItems((s) => [...s, { ...t, id }]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 5000);
    };
    return () => { push = null; };
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-4 end-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={cn("pointer-events-auto flex items-start gap-3 rounded-lg border bg-card p-3 shadow-raised animate-fade-in", t.tone === "error" && "border-danger/40")}>
          {t.tone === "error" ? <AlertTriangle className="mt-0.5 size-4 text-danger" /> : <CheckCircle2 className="mt-0.5 size-4 text-success" />}
          <div className="min-w-0 flex-1"><div className="text-sm font-medium">{t.title}</div>{t.description && <div className="mt-0.5 text-xs text-muted-foreground">{t.description}</div>}</div>
          <button onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))} className="text-muted-foreground" aria-label="Dismiss"><X className="size-4" /></button>
        </div>
      ))}
    </div>
  );
}
