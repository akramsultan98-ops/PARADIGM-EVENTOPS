import { requireUser } from "@/lib/auth/session";
import { db, num } from "@/lib/db";
import { getDict } from "@/i18n/server";
import { departmentProjects } from "@/server/queries/departments";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, StatusBadge, TableWrap } from "@/components/ui/kit";
import { FleetPanel, NoPlan } from "@/components/planning/panels";
import { fmtDate, fmtMoney } from "@/lib/format";
import { ProjectPicker } from "../../_project-picker";
import { cn } from "@/lib/utils";

export const metadata = { title: "Vehicle planning" };

export default async function VehiclesPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const u = await requireUser();
  const { locale } = await getDict();
  const { project } = await searchParams;
  const { projects, plans, focus } = await departmentProjects(u, "LOGISTICS");
  const current = project ? projects.find((p) => p.id === project) ?? focus : focus;
  const [vehicles, bookings] = await Promise.all([
    db.vehicle.findMany({ where: { companyId: u.companyId }, orderBy: { code: "asc" } }),
    db.resourceAssignment.findMany({ where: { resourceType: "VEHICLE", project: { companyId: u.companyId, status: { notIn: ["CANCELLED", "COMPLETED"] } } }, include: { project: { select: { code: true } } }, orderBy: { startAt: "asc" } }),
  ]);
  const days: Date[] = [];
  const start = new Date(); start.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i < 35; i++) days.push(new Date(start.getTime() + i * 86400000));
  return (
    <>
      <PageHeader eyebrow="Logistics" title="Vehicle planning" description="Fleet capacity, availability calendar and project allocations. Weight and volume both constrain every load." />
      <Card className="mb-5 min-w-0">
        <CardHeader><div><CardTitle>Fleet availability — next 5 weeks</CardTitle><CardDescription>Bookings from approved/active project plans; maintenance shown in grey</CardDescription></div></CardHeader>
        <TableWrap>
          <table className="w-full border-collapse text-xs">
            <thead><tr><th className="sticky start-0 z-[1] bg-card px-3 py-2 text-start">Vehicle</th>{days.map((d) => <th key={d.toISOString()} className="min-w-[22px] px-0 py-2 text-center text-[9px] font-normal text-muted-foreground">{d.getUTCDate()}</th>)}</tr></thead>
            <tbody>{vehicles.map((v) => (
              <tr key={v.id} className="border-t">
                <td className="sticky start-0 z-[1] whitespace-nowrap bg-card px-3 py-1.5"><span className="font-medium">{v.code}</span> <span className="text-muted-foreground">{v.payloadKg / 1000} t · {v.volumeM3} m³</span></td>
                {days.map((d) => { const b = bookings.find((x) => x.resourceId === v.id && x.startAt <= new Date(d.getTime() + 86400000) && x.endAt >= d); return <td key={d.toISOString()} className="p-0.5"><div title={b ? b.project.code : v.available ? "free" : v.maintenanceStatus} className={cn("h-5 rounded-sm", !v.available || v.maintenanceStatus !== "OK" ? "bg-muted-foreground/30" : b ? "bg-primary/70" : "bg-success-soft")} /></td>; })}
              </tr>
            ))}</tbody>
          </table>
        </TableWrap>
      </Card>
      <Card className="mb-5 min-w-0">
        <CardHeader><CardTitle>Fleet library</CardTitle></CardHeader>
        <TableWrap><table className="data-table"><thead><tr><th>Vehicle</th><th>Type</th><th className="num">Payload kg</th><th className="num">Volume m³</th><th>Internal L×W×H m</th><th className="num">Daily cost</th><th>Status</th><th>Next booking</th></tr></thead>
          <tbody>{vehicles.map((v) => { const nb = bookings.find((b) => b.resourceId === v.id && b.endAt > new Date()); return <tr key={v.id}><td className="font-medium">{v.code}<div className="text-2xs text-muted-foreground">{v.description}</div></td><td className="text-xs">{v.type.toLowerCase().replace("_", " ")}</td><td className="num">{v.payloadKg.toLocaleString()}</td><td className="num">{v.volumeM3}</td><td className="text-xs tabular">{v.internalLengthM} × {v.internalWidthM} × {v.internalHeightM}</td><td className="num">{fmtMoney(num(v.dailyCost), v.currency, locale)}</td><td>{v.available && v.maintenanceStatus === "OK" ? <StatusBadge status="APPROVED" locale={locale} /> : <span className="text-xs text-danger">{v.maintenanceStatus}</span>}</td><td className="text-xs">{nb ? `${nb.project.code} · ${fmtDate(nb.startAt, locale)}` : "—"}</td></tr>; })}</tbody></table></TableWrap>
      </Card>
      <ProjectPicker base="/logistics/vehicles" projects={projects} current={current?.id} />
      {current && plans.get(current.id) ? <FleetPanel plan={plans.get(current.id)!.plan} locale={locale} /> : <NoPlan projectId={current?.id} canGenerate />}
    </>
  );
}
