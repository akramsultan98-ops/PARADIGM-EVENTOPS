import { requireUser } from "@/lib/auth/session";
import { db, num } from "@/lib/db";
import { getDict } from "@/i18n/server";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DemoBanner, PageHeader, StatusBadge, TableWrap } from "@/components/ui/kit";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtDate, fmtMoney } from "@/lib/format";

export const metadata = { title: "Resources & inventory" };

export default async function ResourcesPage() {
  const u = await requireUser();
  const { t, locale } = await getDict();
  const [materials, equipment, vehicles, reservations, labor] = await Promise.all([
    db.material.findMany({ where: { companyId: u.companyId }, include: { supplier: true }, orderBy: [{ category: "asc" }, { code: "asc" }] }),
    db.equipment.findMany({ where: { companyId: u.companyId }, include: { inventory: true }, orderBy: [{ category: "asc" }, { code: "asc" }] }),
    db.vehicle.findMany({ where: { companyId: u.companyId }, orderBy: { code: "asc" } }),
    db.resourceAssignment.findMany({ where: { project: { companyId: u.companyId, status: { notIn: ["CANCELLED", "COMPLETED"] } } }, include: { project: { select: { code: true, name: true } } }, orderBy: { startAt: "asc" } }),
    db.laborCategory.findMany({ where: { companyId: u.companyId }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title={t.nav.resources} description="Materials stock, AV & technical equipment, fleet and crew capacity, with reservations from active projects." />
      <div className="mb-4"><DemoBanner /></div>
      <Tabs defaultValue="equipment">
        <TabsList><TabsTrigger value="equipment">Equipment ({equipment.length})</TabsTrigger><TabsTrigger value="materials">Materials ({materials.length})</TabsTrigger><TabsTrigger value="fleet">Fleet ({vehicles.length})</TabsTrigger><TabsTrigger value="crew">Crew capacity</TabsTrigger><TabsTrigger value="reservations">Reservations ({reservations.length})</TabsTrigger></TabsList>
        <TabsContent value="equipment"><Card className="min-w-0"><TableWrap><table className="data-table"><thead><tr><th>Code</th><th>Model</th><th>Category</th><th className="num">Owned</th><th className="num">Out of service</th><th className="num">Reserved now</th><th className="num">Weight</th><th className="num">Case m³</th><th className="num">Power W</th><th className="num">Setup min</th><th className="num">Rental/day</th></tr></thead>
          <tbody>{equipment.map((e) => { const owned = e.inventory.reduce((s, i) => s + i.quantity, 0); const res = reservations.filter((r) => r.resourceId === e.id && r.startAt <= new Date() && r.endAt >= new Date()).reduce((s, r) => s + r.quantity, 0); return <tr key={e.id}><td className="font-medium">{e.code}</td><td>{e.model}<div className="text-2xs text-muted-foreground">{e.manufacturer}</div></td><td className="text-xs">{e.category.toLowerCase().replace(/_/g, " ")}</td><td className="num">{owned}</td><td className="num">{e.inventory.reduce((s, i) => s + i.outOfService, 0) || "—"}</td><td className="num">{res || "—"}</td><td className="num">{e.weightKg} kg</td><td className="num">{e.caseVolumeM3}</td><td className="num">{e.powerW}</td><td className="num">{e.setupMinutes}</td><td className="num">{fmtMoney(num(e.rentalDailyRate), e.currency, locale)}</td></tr>; })}</tbody></table></TableWrap></Card></TabsContent>
        <TabsContent value="materials"><Card className="min-w-0"><TableWrap><table className="data-table"><thead><tr><th>Code</th><th>Material</th><th>Category</th><th>Unit</th><th>Standard size</th><th className="num">Waste</th><th className="num">Kerf / trim</th><th className="num">Coverage</th><th className="num">Weight</th><th className="num">Unit cost</th><th className="num">In stock</th><th>Supplier</th><th>Status</th></tr></thead>
          <tbody>{materials.map((m) => <tr key={m.id}><td className="font-medium">{m.code}</td><td>{m.name}</td><td className="text-xs">{m.category.toLowerCase()}</td><td className="text-xs">{m.unit}</td><td className="text-xs tabular">{m.stockLengthM ? `${m.stockLengthM}${m.stockWidthM ? ` × ${m.stockWidthM}` : ""} m` : "—"}{m.thicknessMm ? ` · ${m.thicknessMm} mm` : ""}</td><td className="num">{m.wasteFactorPct}%</td><td className="num">{m.kerfMm ?? "—"} / {m.edgeTrimMm ?? "—"} mm</td><td className="num">{m.coverageM2PerL ? `${m.coverageM2PerL} m²/L` : "—"}</td><td className="num">{m.weightPerUnitKg ?? "—"}</td><td className="num">{fmtMoney(num(m.unitCost), m.currency, locale)}</td><td className="num">{m.stockQty ?? "—"}</td><td className="text-xs">{m.supplier?.name ?? "—"}</td><td><StatusBadge status={m.status} locale={locale} /></td></tr>)}</tbody></table></TableWrap></Card></TabsContent>
        <TabsContent value="fleet"><Card className="min-w-0"><TableWrap><table className="data-table"><thead><tr><th>Vehicle</th><th>Type</th><th className="num">Payload</th><th className="num">Volume</th><th>Internal</th><th>Status</th></tr></thead><tbody>{vehicles.map((v) => <tr key={v.id}><td className="font-medium">{v.code}</td><td className="text-xs">{v.type.toLowerCase().replace("_", " ")}</td><td className="num">{v.payloadKg.toLocaleString()} kg</td><td className="num">{v.volumeM3} m³</td><td className="text-xs">{v.internalLengthM} × {v.internalWidthM} × {v.internalHeightM} m</td><td className="text-xs">{v.available ? v.maintenanceStatus : "unavailable"}</td></tr>)}</tbody></table></TableWrap></Card></TabsContent>
        <TabsContent value="crew"><Card className="min-w-0"><TableWrap><table className="data-table"><thead><tr><th>Trade</th><th className="num">Headcount</th><th className="num">Daily rate</th><th className="num">OT rate / h</th><th>Location</th></tr></thead><tbody>{labor.map((l) => <tr key={l.id}><td className="font-medium">{l.name}</td><td className="num">{l.headcountAvailable}</td><td className="num">{fmtMoney(num(l.dailyRate), l.currency, locale)}</td><td className="num">{fmtMoney(num(l.overtimeHourlyRate), l.currency, locale)}</td><td>{l.location}</td></tr>)}</tbody></table></TableWrap></Card></TabsContent>
        <TabsContent value="reservations"><Card className="min-w-0"><CardHeader><div><CardTitle>Reservations</CardTitle><CardDescription>Used to detect double bookings across projects</CardDescription></div></CardHeader><TableWrap><table className="data-table"><thead><tr><th>Project</th><th>Type</th><th>Resource</th><th className="num">Qty</th><th>From</th><th>To</th><th>Status</th></tr></thead><tbody>{reservations.map((r) => <tr key={r.id}><td>{r.project.name}</td><td className="text-xs">{r.resourceType.toLowerCase()}</td><td className="text-xs">{equipment.find((e) => e.id === r.resourceId)?.code ?? vehicles.find((v) => v.id === r.resourceId)?.code ?? r.resourceId}</td><td className="num">{r.quantity}</td><td className="text-xs">{fmtDate(r.startAt, locale)}</td><td className="text-xs">{fmtDate(r.endAt, locale)}</td><td className="text-xs">{r.status.toLowerCase()}</td></tr>)}</tbody></table></TableWrap></Card></TabsContent>
      </Tabs>
    </>
  );
}
