import Link from "next/link";
import { Plus } from "lucide-react";
import { db, num } from "@/lib/db";
import { projectContext } from "@/server/queries/project";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, StatusBadge, TableWrap } from "@/components/ui/kit";
import { AvAllocationTable, CuttingPlans, FleetPanel, IssuesPanel, NoPlan, ProductionItemsMetrics, RoomingPanel } from "@/components/planning/panels";
import { fmtDate, fmtMoney, fmtNumber } from "@/lib/format";
import { AddCargoDialog, BrandingApproval, BrandingDialog, GuestDialog } from "./forms";
import { DeleteAvRequirement } from "./small-actions";

const canEditDept = (u: Awaited<ReturnType<typeof projectContext>>["u"], key: string) => u.permissions.has("submission.create") && (["SUPER_ADMIN", "PROJECT_MANAGER", "ACCOUNT_MANAGER"].includes(u.role) || u.approvalDepartment === key || u.departments.some((d) => d.key === key));

export async function ProductionTab({ id }: { id: string }) {
  const { u, locale, plan } = await projectContext(id);
  const items = await db.productionItem.findMany({ where: { projectId: id }, include: { specs: { include: { material: true } }, boardMaterial: true }, orderBy: { code: "asc" } });
  return (
    <div className="space-y-5">
      <div className="flex justify-end">{canEditDept(u, "PRODUCTION") && <Button asChild size="lg"><Link href={`/production/new?project=${id}`}><Plus />ADD PRODUCTION REQUIREMENTS</Link></Button>}</div>
      {items.map((i) => (
        <Card key={i.id} className="min-w-0">
          <CardHeader>
            <div className="min-w-0"><CardTitle>{i.code} — {i.name}</CardTitle><CardDescription>{i.category.toLowerCase()} · {i.quantity} × {i.widthM ?? "?"} × {i.heightM ?? "?"} × {i.depthM ?? "?"} m · board {i.boardMaterial?.code ?? "—"} · {i.finishing ?? "finishing TBC"}{i.installationDay ? ` · install setup day ${i.installationDay}` : ""}</CardDescription></div>
            <div className="flex flex-wrap gap-1.5"><StatusBadge status={i.drawingStatus} locale={locale} /><StatusBadge status={i.state} locale={locale} />{i.engineeringApprovalRequired && <span className="rounded bg-warning-soft px-1.5 py-0.5 text-2xs font-semibold text-warning">engineer approval required</span>}</div>
          </CardHeader>
          {i.specs.length > 0 ? (
            <TableWrap><table className="data-table"><thead><tr><th>Component</th><th>Kind</th><th>Material</th><th className="num">L (m)</th><th className="num">W (m)</th><th className="num">Qty</th><th className="num">Sides/coats</th><th>Drawing ref.</th></tr></thead>
              <tbody>{i.specs.map((s) => <tr key={s.id}><td>{s.label}{s.notes && <div className="text-2xs text-warning">{s.notes}</div>}</td><td className="text-xs">{s.kind.toLowerCase().replace("_", " ")}</td><td className="text-xs">{s.material?.code ?? "—"}</td><td className="num">{s.lengthM ?? "—"}</td><td className="num">{s.widthM ?? "—"}</td><td className="num">{s.quantity}</td><td className="num">{s.kind === "PAINT_SURFACE" ? `${s.sides} / ${s.coats ?? "?"}` : "—"}</td><td className="text-2xs text-muted-foreground">{s.drawingRef ?? "—"}</td></tr>)}</tbody></table></TableWrap>
          ) : <CardContent className="text-sm text-warning">No drawing-derived components yet — quantities for this item are estimates and framing is not calculated.</CardContent>}
          {(i.constructionMethod || i.installationMethod || i.notes) && <CardContent className="border-t text-xs text-muted-foreground">{i.constructionMethod && <div><span className="font-semibold text-foreground">Construction: </span>{i.constructionMethod}</div>}{i.installationMethod && <div><span className="font-semibold text-foreground">Installation: </span>{i.installationMethod}</div>}{i.notes && <div className="whitespace-pre-line">{i.notes}</div>}</CardContent>}
        </Card>
      ))}
      {items.length === 0 && <EmptyState title="No production items" />}
      {plan ? <><ProductionItemsMetrics plan={plan.plan} locale={locale} /><CuttingPlans plan={plan.plan} /><IssuesPanel issues={plan.plan.issues.filter((x) => x.department === "PRODUCTION")} title="Production validation" /></> : <NoPlan projectId={id} canGenerate />}
    </div>
  );
}

export async function AvTab({ id }: { id: string }) {
  const { u, locale, plan } = await projectContext(id);
  const reqs = await db.equipmentRequirement.findMany({ where: { projectId: id }, include: { equipment: true }, orderBy: { createdAt: "asc" } });
  const editable = canEditDept(u, "AV");
  return (
    <div className="space-y-5">
      <Card className="min-w-0">
        <CardHeader><div><CardTitle>AV & technical requirements</CardTitle><CardDescription>Submitted by the AV department</CardDescription></div>{editable && <Button asChild size="sm"><Link href={`/av/new?project=${id}`}><Plus />Add AV requirements</Link></Button>}</CardHeader>
        <TableWrap><table className="data-table"><thead><tr><th>Requirement</th><th>Category</th><th>Model</th><th className="num">Qty</th><th className="num">Backup</th><th className="num">Allocated</th><th className="num">Rental</th><th>State</th><th /></tr></thead>
          <tbody>{reqs.map((r) => <tr key={r.id}><td className="font-medium">{r.description}</td><td className="text-xs">{r.category.toLowerCase().replace(/_/g, " ")}</td><td className="text-xs">{r.equipment ? `${r.equipment.code} ${r.equipment.model}` : <span className="text-danger">not selected</span>}</td><td className="num">{r.quantity}</td><td className="num">{r.backupQuantity}</td><td className="num">{r.allocatedQty}</td><td className="num">{r.rentalQty || "—"}</td><td><StatusBadge status={r.state} locale={locale} /></td><td>{editable && r.state !== "APPROVED" && <DeleteAvRequirement id={r.id} />}</td></tr>)}</tbody></table></TableWrap>
      </Card>
      {plan ? <><AvAllocationTable plan={plan.plan} locale={locale} /><IssuesPanel issues={plan.plan.issues.filter((x) => x.department === "AV")} title="AV validation" /></> : <NoPlan projectId={id} canGenerate />}
    </div>
  );
}

export async function LogisticsTab({ id }: { id: string }) {
  const { u, locale, plan } = await projectContext(id);
  const cargo = await db.cargoItem.findMany({ where: { projectId: id }, orderBy: { name: "asc" } });
  return (
    <div className="space-y-5">
      {plan ? <FleetPanel plan={plan.plan} locale={locale} /> : <NoPlan projectId={id} canGenerate />}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader><div><CardTitle>Additional cargo</CardTitle><CardDescription>Production items and AV equipment are added automatically from their specifications</CardDescription></div>{canEditDept(u, "LOGISTICS") && <AddCargoDialog projectId={id} />}</CardHeader>
          <TableWrap><table className="data-table"><thead><tr><th>Item</th><th className="num">Qty</th><th>Dimensions (m)</th><th className="num">kg/unit</th><th>Fragile</th><th>State</th></tr></thead><tbody>{cargo.map((c) => <tr key={c.id}><td>{c.name}</td><td className="num">{c.quantity}</td><td className="text-xs tabular">{c.lengthM ?? "?"} × {c.widthM ?? "?"} × {c.heightM ?? "?"}</td><td className="num">{c.unitWeightKg ?? "—"}</td><td>{c.fragile ? "yes" : "—"}</td><td><StatusBadge status={c.state} locale={locale} /></td></tr>)}</tbody></table></TableWrap>
        </Card>
        {plan && (
          <Card className="min-w-0"><CardHeader><div><CardTitle>Full cargo manifest</CardTitle><CardDescription>As used by the fleet allocation</CardDescription></div></CardHeader>
            <TableWrap><table className="data-table"><thead><tr><th>Cargo</th><th>Source</th><th className="num">Units</th><th className="num">kg/unit</th><th className="num">m³/unit</th></tr></thead><tbody>{plan.plan.cargo.map((c) => <tr key={c.key}><td>{c.name}</td><td className="text-xs">{c.sourceType.toLowerCase()}</td><td className="num">{c.quantity}</td><td className="num">{c.unitWeightKg ?? <span className="text-danger">?</span>}</td><td className="num">{c.unitVolumeM3 ?? <span className="text-danger">?</span>}</td></tr>)}</tbody></table></TableWrap>
          </Card>
        )}
      </div>
    </div>
  );
}

export async function AccommodationTab({ id }: { id: string }) {
  const { u, locale, plan } = await projectContext(id);
  const [guests, hotels] = await Promise.all([
    db.accommodationAssignment.findMany({ where: { projectId: id }, include: { hotel: true, roomType: true, department: true }, orderBy: [{ hotel: { name: "asc" } }, { roomLabel: "asc" }] }),
    db.hotel.findMany({ where: { companyId: u.companyId }, include: { roomTypes: true } }),
  ]);
  const editable = canEditDept(u, "ACCOMMODATION");
  const hs = hotels.map((h) => ({ id: h.id, name: h.name, roomTypes: h.roomTypes.map((t) => ({ id: t.id, name: t.name, capacity: t.capacity })) }));
  return (
    <div className="space-y-5">
      <Card className="min-w-0">
        <CardHeader><div><CardTitle>Staff accommodation requirements</CardTitle><CardDescription>{guests.length} entries</CardDescription></div>{editable && <GuestDialog projectId={id} hotels={hs} />}</CardHeader>
        <TableWrap><table className="data-table"><thead><tr><th>Guest</th><th>Department / role</th><th>Hotel · room</th><th>Shared</th><th>Check-in</th><th>Check-out</th><th>Status</th><th>Confirmation</th><th /></tr></thead>
          <tbody>{guests.map((g) => <tr key={g.id}><td className="font-medium">{g.guestName ?? <span className="text-danger">name missing</span>}<div className="text-2xs text-muted-foreground">{g.employeeCode}</div></td><td className="text-xs">{g.department?.name} · {g.jobRole}</td><td className="text-xs">{g.hotel?.name} · {g.roomType?.name}</td><td className="text-xs">{g.roomLabel ?? "—"}</td><td className="whitespace-nowrap text-xs">{fmtDate(g.checkIn, locale)}</td><td className="whitespace-nowrap text-xs">{fmtDate(g.checkOut, locale)}</td><td><StatusBadge status={g.bookingStatus} locale={locale} /></td><td className="text-xs">{g.confirmationRef ?? "—"}</td><td>{editable && <GuestDialog trigger="edit" projectId={id} hotels={hs} guest={{ id: g.id, guestName: g.guestName, employeeCode: g.employeeCode, departmentKey: g.department?.key, jobRole: g.jobRole, hotelId: g.hotelId, roomTypeId: g.roomTypeId, roomLabel: g.roomLabel, checkIn: g.checkIn?.toISOString().slice(0, 10), checkOut: g.checkOut?.toISOString().slice(0, 10), bookingStatus: g.bookingStatus, confirmationRef: g.confirmationRef, specialRequests: g.specialRequests }} />}</td></tr>)}</tbody></table></TableWrap>
      </Card>
      {plan ? <div className="grid gap-5 xl:grid-cols-3"><div className="min-w-0 xl:col-span-2"><RoomingPanel plan={plan.plan} locale={locale} /></div><IssuesPanel issues={plan.plan.issues.filter((x) => x.department === "ACCOMMODATION")} title="Rooming validation" /></div> : <NoPlan projectId={id} canGenerate />}
    </div>
  );
}

export async function CreativeTab({ id }: { id: string }) {
  const { u, locale, plan } = await projectContext(id);
  const [items, vendors] = await Promise.all([db.brandingItem.findMany({ where: { projectId: id }, include: { vendor: true }, orderBy: { createdAt: "asc" } }), db.vendor.findMany({ where: { companyId: u.companyId }, select: { id: true, name: true } })]);
  const editable = canEditDept(u, "CREATIVE");
  return (
    <div className="space-y-5">
      <Card className="min-w-0">
        <CardHeader><div><CardTitle>Branding, artwork & printing</CardTitle><CardDescription>Printing BOQ, deadlines and client approval tracking</CardDescription></div>{editable && <BrandingDialog projectId={id} vendors={vendors} />}</CardHeader>
        <TableWrap><table className="data-table"><thead><tr><th>Item</th><th>Size (m)</th><th className="num">Qty</th><th className="num">Area m²</th><th>Material / method</th><th>Vendor · lead</th><th>Client approval by</th><th>Delivery</th><th>Client approval</th><th className="num">Value</th></tr></thead>
          <tbody>{items.map((b) => <tr key={b.id}><td className="font-medium">{b.name}</td><td className="text-xs tabular">{b.widthM != null ? `${b.widthM} × ${b.heightM}` : <span className="text-danger">missing</span>}</td><td className="num">{b.quantity ?? <span className="text-danger">?</span>}</td><td className="num">{b.widthM != null && b.heightM != null && b.quantity != null ? fmtNumber(b.widthM * b.heightM * b.quantity, 2) : "—"}</td><td className="text-xs">{b.material} · {b.printMethod}</td><td className="text-xs">{b.vendor?.name ?? "—"} · {b.leadTimeDays ?? "?"} d</td><td className="whitespace-nowrap text-xs">{fmtDate(b.clientApprovalDeadline, locale)}</td><td className="whitespace-nowrap text-xs">{fmtDate(b.deliveryDeadline, locale)}</td><td>{editable ? <BrandingApproval id={b.id} status={b.approvalStatus} /> : <StatusBadge status={b.approvalStatus} locale={locale} />}</td><td className="num">{fmtMoney(b.quantity != null && num(b.unitCost) != null ? num(b.unitCost)! * b.quantity : null, b.currency, locale)}</td></tr>)}</tbody></table></TableWrap>
        {items.length === 0 && <EmptyState title="No branding items" className="m-4" />}
      </Card>
      {plan && <IssuesPanel issues={plan.plan.issues.filter((x) => x.department === "CREATIVE")} title="Creative validation" />}
    </div>
  );
}
