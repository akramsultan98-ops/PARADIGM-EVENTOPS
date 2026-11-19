"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { TableWrap } from "@/components/ui/kit";
import { toast } from "@/components/ui/toast";
import { commitImportAction, previewImportAction, proposeRateChangeAction } from "@/server/actions/knowledge";

const TARGETS = { materials: ["code", "name", "category", "unit", "stockLengthM", "stockWidthM", "thicknessMm", "weightPerUnitKg", "coverageM2PerL", "wasteFactorPct", "kerfMm", "edgeTrimMm", "unitCost", "currency", "stockQty"], vendors: ["name", "contactName", "phone", "email", "location", "services", "leadTimeDays"], equipment: ["code", "category", "model", "manufacturer", "weightKg", "caseVolumeM3", "powerW", "setupMinutes", "techniciansRequired", "rentalDailyRate", "quantity"], historical: ["event", "date", "location", "participants", "category", "planned", "actual", "unit", "lessons"] } as const;
type T = keyof typeof TARGETS;

export function Importer() {
  const [target, setTarget] = useState<T>("materials");
  const [preview, setPreview] = useState<{ headers: string[]; rows: Record<string, string>[]; mapping: Record<string, string>; total: number } | null>(null);
  const [result, setResult] = useState<{ created: number; duplicates: number; errors: string[] } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-4">
      <form className="flex flex-col gap-2 sm:flex-row" action={(fd) => { fd.set("target", target); setResult(null); start(async () => { const r = await previewImportAction(fd); if (r.ok) setPreview(r.data as never); else toast(r.error, { tone: "error" }); }); }}>
        <NativeSelect value={target} onChange={(e) => { setTarget(e.target.value as T); setPreview(null); }} className="sm:w-56">{Object.keys(TARGETS).map((k) => <option key={k} value={k}>{k}</option>)}</NativeSelect>
        <Input name="file" type="file" accept=".csv,.xlsx" required className="pt-1.5" />
        <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <FileUp />}Preview</Button>
      </form>
      {preview && (
        <div className="space-y-3">
          <div className="text-sm font-semibold">{preview.total} row(s) · map columns</div>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">{TARGETS[target].map((f) => <Field key={f} label={f}><NativeSelect value={preview.mapping[f] ?? ""} onChange={(e) => setPreview({ ...preview, mapping: { ...preview.mapping, [f]: e.target.value } })}><option value="">— not mapped —</option>{preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}</NativeSelect></Field>)}</div>
          <TableWrap className="max-h-72 rounded border"><table className="data-table"><thead><tr>{preview.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{preview.rows.slice(0, 15).map((r, i) => <tr key={i}>{preview.headers.map((h) => <td key={h} className="text-xs">{r[h]}</td>)}</tr>)}</tbody></table></TableWrap>
          <Button disabled={pending} onClick={() => start(async () => { const r = await commitImportAction({ target, mapping: preview.mapping, rows: preview.rows, skipDuplicates: true }); if (r.ok) { setResult(r.data as never); toast("Import completed"); router.refresh(); } else toast(r.error, { tone: "error" }); })}>Validate & import</Button>
        </div>
      )}
      {result && <div className="rounded-md border p-3 text-sm"><div><b>{result.created}</b> created · <b>{result.duplicates}</b> duplicate(s) skipped · <b>{result.errors.length}</b> error(s)</div>{result.errors.map((e) => <div key={e} className="text-xs text-danger">{e}</div>)}</div>}
    </div>
  );
}

export function RateProposal({ trades }: { trades: { key: string; name: string; rates: { activity: string; unit: string; hours: number }[] }[] }) {
  const [trade, setTrade] = useState(trades[0]?.key ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form className="grid gap-2 sm:grid-cols-[1fr_1fr_90px_90px_2fr_auto]" action={(f) => start(async () => { const r = await proposeRateChangeAction(trade, String(f.get("activity")).toUpperCase().replace(/\s+/g, "_"), String(f.get("unit")), Number(f.get("hours")), String(f.get("evidence"))); if (r.ok) { toast(r.message ?? "Proposed"); router.refresh(); } else toast(r.error, { tone: "error" }); })}>
      <NativeSelect value={trade} onChange={(e) => setTrade(e.target.value)}>{trades.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}</NativeSelect>
      <Input name="activity" placeholder="Activity e.g. DISMANTLE" list="activities" required />
      <datalist id="activities">{trades.find((t) => t.key === trade)?.rates.map((r) => <option key={r.activity} value={r.activity} />)}<option value="DISMANTLE" /></datalist>
      <Input name="unit" placeholder="m2 / m3" required />
      <Input name="hours" type="number" step="0.01" placeholder="h/unit" required />
      <Input name="evidence" placeholder="Evidence (actuals, time study…)" required />
      <Button type="submit" disabled={pending}>Propose</Button>
    </form>
  );
}
