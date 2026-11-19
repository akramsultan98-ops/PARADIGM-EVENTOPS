import Link from "next/link";
import { AlertTriangle, BedDouble, Boxes, CalendarCheck, CircleDollarSign, ClipboardCheck, FileWarning, Hammer, Layers, MonitorSpeaker, Palette, Plus, ShoppingCart, Truck, Users, Zap } from "lucide-react";
import type { AuthUser } from "@/lib/auth/session";
import { db, num } from "@/lib/db";
import { getDict } from "@/i18n/server";
import { departmentProjects } from "@/server/queries/departments";
import { pendingApprovalsWhere } from "@/server/services/approvals";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DemoBanner, EmptyState, PageHeader, StatCard, StatusBadge, TableWrap } from "@/components/ui/kit";
import { Badge } from "@/components/ui/badge";
import { AvAllocationTable, BoqTable, FleetPanel, IssuesPanel, NoPlan, ProcurementPlanTable, RoomingPanel, TradesTable } from "@/components/planning/panels";
import { daysUntil, fmtDate, fmtDateTime, fmtMoney, fmtNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PlanResult } from "@/engines/pipeline";

type WS = { user: AuthUser; projectId?: string };

function ProjectChips({ base, projects, current }: { base: string; projects: { id: string; name: string; code: string }[]; current?: string }) {
  if (projects.length < 2 && !current) return null;
  return (
    <div className="scrollbar-thin mb-4 flex gap-1.5 overflow-x-auto pb-1">
      <Link href={base} className={cn("whitespace-nowrap rounded-full border px-3 py-1 text-xs", !current ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>All projects</Link>
      {projects.map((p) => <Link key={p.id} href={`${base}?project=${p.id}`} className={cn("whitespace-nowrap rounded-full border px-3 py-1 text-xs", current === p.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>{p.name}</Link>)}
    </div>
  );
}

function TaskList({ plan, filter, title, description, locale }: { plan: PlanResult; filter: (key: string) => boolean; title: string; description?: string; locale: "en" | "ar" }) {
  const tasks = plan.tasks.filter((t) => filter(t.key));
  return (
    <Card className="min-w-0">
      <CardHeader><div><CardTitle>{title}</CardTitle>{description && <CardDescription>{description}</CardDescription>}</div></CardHeader>
      <TableWrap>
        <table className="data-table">
          <thead><tr><th>WBS</th><th>Task</th><th>Start</th><th>Finish</th><th className="num">Duration</th><th className="num">Crew</th><th className="num">Float</th></tr></thead>
          <tbody>{tasks.map((t) => (
            <tr key={t.key} className={cn(t.critical && "bg-danger-soft/30")}><td className="text-2xs text-muted-foreground tabular">{t.wbsCode}</td><td className="min-w-[200px]"><div className="font-medium">{t.name}</div>{t.durationState === "NEEDS_INFORMATION" && <div className="text-2xs text-danger">duration not verified</div>}</td><td className="whitespace-nowrap text-xs">{fmtDateTime(t.start, locale)}</td><td className="whitespace-nowrap text-xs">{fmtDateTime(t.finish, locale)}</td><td className="num">{fmtNumber(t.durationHours, 1)} h</td><td className="num">{t.crewSize ? `${t.crewSize} × ${t.laborKey?.toLowerCase()}` : "—"}</td><td className={cn("num", t.critical && "font-semibold text-danger")}>{t.critical ? "critical" : `${fmtNumber(t.floatHours, 0)} h`}</td></tr>
          ))}</tbody>
        </table>
      </TableWrap>
      {tasks.length === 0 && <EmptyState title="No scheduled tasks" className="m-4" />}
    </Card>
  );
}

// ───────────────────────── Production ─────────────────────────
export async function ProductionWorkspace({ user, projectId }: WS) {
  const { t, locale } = await getDict();
  const { projects, plans, focus, focusPlan } = await departmentProjects(user, "PRODUCTION", projectId);
  const ids = projects.map((p) => p.id);
  const [items, subs, approvals] = await Promise.all([
    db.productionItem.findMany({ where: { projectId: { in: ids } }, include: { project: { select: { name: true, id: true } }, boardMaterial: true, _count: { select: { specs: true } } }, orderBy: [{ project: { eventStart: "asc" } }, { code: "asc" }] }),
    db.departmentSubmission.findMany({ where: { projectId: { in: ids }, department: { key: "PRODUCTION" } }, include: { project: { select: { name: true, id: true } }, submittedBy: { select: { name: true } } }, orderBy: { updatedAt: "desc" } }),
    db.approval.count({ where: { ...pendingApprovalsWhere(user), entityType: { in: ["SUBMISSION", "PRODUCTION_ITEM"] } } }),
  ]);
  const plan = focusPlan?.plan;
  const awaiting = items.filter((i) => i.calculationState === "NEEDS_INFORMATION" || i.drawingStatus === "MISSING");
  const boards = [...plans.values()].reduce((s, p) => s + p.plan.production.boq.filter((b) => b.category === "BOARD").reduce((a, b) => a + b.purchaseQuantity, 0), 0);
  const workshopHours = [...plans.values()].reduce((s, p) => s + p.plan.trades.filter((x) => x.phase === "WORKSHOP").reduce((a, b) => a + b.totalHours, 0), 0);
  const canAdd = user.permissions.has("submission.create");
  return (
    <>
      <PageHeader eyebrow={t.nav.production} title="Production workspace" description="Production scope, technical specifications, BOQ, materials, manpower and workshop schedule."
        actions={canAdd && <Button size="lg" asChild className="shadow-raised"><Link href={`/production/new${projectId ? `?project=${projectId}` : focus ? `?project=${focus.id}` : ""}`}><Plus />ADD PRODUCTION REQUIREMENTS</Link></Button>} />
      <ProjectChips base="/production" projects={projects} current={projectId} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Assigned projects" value={projects.length} icon={Layers} />
        <StatCard label="Production items" value={items.length} icon={Hammer} />
        <StatCard label="Awaiting specifications" value={awaiting.length} icon={FileWarning} tone={awaiting.length ? "danger" : "success"} sub="missing drawings / data" />
        <StatCard label="Pending approvals" value={approvals} icon={ClipboardCheck} tone={approvals ? "warning" : "success"} href="/approvals" />
        <StatCard label="Boards to purchase" value={fmtNumber(boards)} icon={Boxes} sub="all projects, from cutting plans" />
        <StatCard label="Workshop labour" value={`${fmtNumber(workshopHours)} h`} icon={Users} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader><div><CardTitle>Production scope & technical specifications</CardTitle><CardDescription>Items, dimensions, materials, drawings and validation state</CardDescription></div></CardHeader>
          <TableWrap>
            <table className="data-table">
              <thead><tr><th>Item</th><th>Project</th><th className="num">Qty</th><th>W × H × D (m)</th><th>Board</th><th>Drawing</th><th className="num">Components</th><th>Install</th><th>State</th></tr></thead>
              <tbody>{items.map((i) => (
                <tr key={i.id}><td className="min-w-[180px]"><div className="font-medium">{i.code} {i.name}</div><div className="text-2xs text-muted-foreground">{i.category.toLowerCase()} · {i.finishing ?? "finishing TBC"}</div></td><td className="text-xs"><Link href={`/projects/${i.project.id}/production`} className="hover:text-primary">{i.project.name}</Link></td><td className="num">{i.quantity}</td><td className="whitespace-nowrap text-xs tabular">{i.widthM ?? "?"} × {i.heightM ?? "?"} × {i.depthM ?? "?"}</td><td className="whitespace-nowrap text-xs">{i.boardMaterial?.code ?? "—"}</td><td><StatusBadge status={i.drawingStatus} locale={locale} /></td><td className="num">{i._count.specs}</td><td className="whitespace-nowrap text-xs">{i.installationDay ? `Day ${i.installationDay}` : "—"}</td><td><StatusBadge status={i.approvalStatus} locale={locale} /><StatusBadge status={i.calculationState} locale={locale} />{i.engineeringApprovalRequired && <div className="mt-1 text-[10px] text-warning">engineer approval</div>}</td></tr>
              ))}</tbody>
            </table>
          </TableWrap>
          {items.length === 0 && <EmptyState title="No production items yet" action={canAdd ? <Button asChild size="sm"><Link href="/production/new">Add production requirements</Link></Button> : undefined} className="m-4" />}
        </Card>
        <Card className="min-w-0">
          <CardHeader><div><CardTitle>Submissions & drafts</CardTitle><CardDescription>Forms and conversational inputs</CardDescription></div></CardHeader>
          <CardContent className="space-y-1 p-2 sm:p-2">
            {subs.map((s) => (
              <Link key={s.id} href={`/projects/${s.project.id}/inputs?submission=${s.id}`} className="block rounded-md px-3 py-2 hover:bg-muted">
                <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{s.title}</span><StatusBadge status={s.status} locale={locale} /></div>
                <div className="text-2xs text-muted-foreground">{s.project.name} · {s.method.toLowerCase().replace("_", " ")} · {s.submittedBy.name}</div>
              </Link>
            ))}
            {subs.length === 0 && <EmptyState title="No submissions" className="border-0" />}
          </CardContent>
        </Card>
      </div>

      {focus && (
        <div className="mt-6 space-y-5">
          <div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-base font-semibold">{focus.name}</h2><span className="text-xs text-muted-foreground">plan v{focusPlan?.version ?? "—"} · setup {fmtDate(focus.setupStart, locale)}</span><Link className="ms-auto text-xs font-medium text-primary" href={`/production/boq?project=${focus.id}`}>Full BOQ review →</Link></div>
          {plan ? (
            <>
              <BoqTable plan={plan} locale={locale} />
              <div className="grid gap-5 xl:grid-cols-2">
                <TaskList plan={plan} filter={(k) => k.startsWith("FAB:") || k.startsWith("PAINT:") || k.startsWith("PROC:")} title="Workshop preparation & material procurement" description="Fabrication starts when materials arrive" locale={locale} />
                <TaskList plan={plan} filter={(k) => k.startsWith("INST:") || k === "DISMANTLE"} title="Installation schedule" description="Inside venue access hours" locale={locale} />
              </div>
              <TradesTable plan={plan} locale={locale} />
              <IssuesPanel issues={plan.issues.filter((i) => i.department === "PRODUCTION")} title="Production — missing specifications & validation" />
            </>
          ) : <NoPlan projectId={focus.id} canGenerate />}
        </div>
      )}
    </>
  );
}

// ───────────────────────── AV ─────────────────────────
export async function AvWorkspace({ user, projectId }: WS) {
  const { t, locale } = await getDict();
  const { projects, focus, focusPlan } = await departmentProjects(user, "AV", projectId);
  const [equipment, reqs, approvals] = await Promise.all([
    db.equipment.findMany({ where: { companyId: user.companyId }, include: { inventory: true }, orderBy: [{ category: "asc" }, { code: "asc" }] }),
    db.equipmentRequirement.findMany({ where: { projectId: { in: projects.map((p) => p.id) } }, include: { project: { select: { name: true, id: true } }, equipment: true } }),
    db.approval.count({ where: { ...pendingApprovalsWhere(user), entityType: "SUBMISSION" } }),
  ]);
  const others = await db.resourceAssignment.findMany({ where: { resourceType: "EQUIPMENT", project: { companyId: user.companyId, status: { notIn: ["CANCELLED", "COMPLETED"] } } }, include: { project: { select: { code: true, name: true } } } });
  const plan = focusPlan?.plan;
  const rentals = reqs.reduce((s, r) => s + r.rentalQty, 0);
  return (
    <>
      <PageHeader eyebrow={t.nav.av} title="AV & technical workspace" description="Equipment requirements, inventory, rentals, power, technicians, installation and testing."
        actions={user.permissions.has("submission.create") && <Button size="lg" asChild><Link href={`/av/new${focus ? `?project=${focus.id}` : ""}`}><Plus />ADD AV REQUIREMENTS</Link></Button>} />
      <ProjectChips base="/av" projects={projects} current={projectId} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Assigned events" value={projects.length} icon={CalendarCheck} />
        <StatCard label="Requirement lines" value={reqs.length} icon={MonitorSpeaker} />
        <StatCard label="Units to rent" value={rentals} icon={ShoppingCart} tone={rentals ? "warning" : "success"} sub="inventory gaps" />
        <StatCard label="Power load (focus)" value={plan ? `${plan.av.totalPowerKw} kW` : "—"} icon={Zap} sub={focus?.venue?.powerCapacityKw ? `venue ${focus.venue.powerCapacityKw} kW` : "venue capacity unknown"} />
        <StatCard label="Technician hours" value={plan ? fmtNumber(plan.av.techHours, 1) : "—"} icon={Users} />
        <StatCard label="Pending approvals" value={approvals} icon={ClipboardCheck} tone={approvals ? "warning" : "success"} href="/approvals" />
      </div>
      {focus && plan ? (
        <div className="mt-5 space-y-5">
          <AvAllocationTable plan={plan} locale={locale} />
          <div className="grid gap-5 xl:grid-cols-2">
            <TaskList plan={plan} filter={(k) => k.startsWith("AVI:") || k === "AV:TEST" || k === "REHEARSAL"} title="Installation, testing & rehearsal" description={`${focus.name}`} locale={locale} />
            <TradesTable plan={plan} locale={locale} phase="SITE" />
          </div>
          <IssuesPanel issues={plan.issues.filter((i) => i.department === "AV")} title="AV — validation & approvals" />
        </div>
      ) : focus ? <div className="mt-5"><NoPlan projectId={focus.id} canGenerate /></div> : null}
      <Card className="mt-5 min-w-0">
        <CardHeader><div><CardTitle>Equipment inventory & availability</CardTitle><CardDescription>Owned stock and reservations across all active projects</CardDescription></div><Link href="/resources" className="text-xs font-medium text-primary">Resources →</Link></CardHeader>
        <TableWrap>
          <table className="data-table">
            <thead><tr><th>Code</th><th>Model</th><th>Category</th><th className="num">Owned</th><th className="num">Out of service</th><th className="num">Reserved</th><th className="num">Power W</th><th className="num">Weight kg</th><th className="num">Rental / day</th><th>Bookings</th></tr></thead>
            <tbody>{equipment.map((e) => {
              const owned = e.inventory.reduce((s, i) => s + i.quantity, 0), oos = e.inventory.reduce((s, i) => s + i.outOfService, 0);
              const bookings = others.filter((o) => o.resourceId === e.id);
              return <tr key={e.id}><td className="font-medium">{e.code}</td><td>{e.model}</td><td className="text-xs">{e.category.toLowerCase().replace(/_/g, " ")}</td><td className="num">{owned}</td><td className="num">{oos || "—"}</td><td className="num">{bookings.reduce((s, b) => s + b.quantity, 0) || "—"}</td><td className="num">{fmtNumber(e.powerW)}</td><td className="num">{fmtNumber(e.weightKg, 1)}</td><td className="num">{fmtMoney(num(e.rentalDailyRate), e.currency, locale)}</td><td className="text-2xs text-muted-foreground">{bookings.map((b) => `${b.quantity} × ${b.project.code} (${fmtDate(b.startAt, locale, { day: "2-digit", month: "short" })}–${fmtDate(b.endAt, locale, { day: "2-digit", month: "short" })})`).join("; ") || "—"}</td></tr>;
            })}</tbody>
          </table>
        </TableWrap>
      </Card>
    </>
  );
}

// ───────────────────────── Logistics ─────────────────────────
export async function LogisticsWorkspace({ user, projectId }: WS) {
  const { t, locale } = await getDict();
  const { projects, focus, focusPlan } = await departmentProjects(user, "LOGISTICS", projectId);
  const [vehicles, trips, drivers, routes] = await Promise.all([
    db.vehicle.findMany({ where: { companyId: user.companyId }, orderBy: { code: "asc" } }),
    db.vehicleAssignment.findMany({ where: { projectId: { in: projects.map((p) => p.id) } }, include: { vehicle: true, project: { select: { name: true, id: true } }, driver: true }, orderBy: { departureAt: "asc" } }),
    db.driver.findMany({ where: { companyId: user.companyId } }),
    db.routeEstimate.findMany({ where: { companyId: user.companyId } }),
  ]);
  const plan = focusPlan?.plan;
  const upcoming = trips.filter((tr) => tr.departureAt && tr.departureAt > new Date());
  return (
    <>
      <PageHeader eyebrow={t.nav.logistics} title="Logistics workspace" description="Deliveries, fleet availability, cargo, loading windows, drivers and backup vehicles."
        actions={<Button variant="outline" asChild><Link href={`/logistics/vehicles${focus ? `?project=${focus.id}` : ""}`}><Truck />Vehicle planning</Link></Button>} />
      <ProjectChips base="/logistics" projects={projects} current={projectId} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Upcoming trips" value={upcoming.length} icon={Truck} />
        <StatCard label="Vehicles available" value={`${vehicles.filter((v) => v.available && v.maintenanceStatus === "OK").length}/${vehicles.length}`} icon={Truck} />
        <StatCard label="Drivers available" value={`${drivers.filter((d) => d.available).length}/${drivers.length}`} icon={Users} />
        <StatCard label="Cargo (focus)" value={plan ? `${fmtNumber(plan.logistics.totals.weightKg)} kg` : "—"} icon={Boxes} sub={plan ? `${fmtNumber(plan.logistics.totals.volumeM3, 1)} m³` : undefined} />
        <StatCard label="Unallocated cargo" value={plan ? plan.logistics.unassigned.length : "—"} icon={AlertTriangle} tone={plan?.logistics.unassigned.length ? "danger" : "success"} />
        <StatCard label="Approved routes" value={`${routes.filter((r) => r.approved).length}/${routes.length}`} icon={CalendarCheck} tone={routes.some((r) => !r.approved) ? "warning" : "success"} sub="unapproved = estimates" />
      </div>
      {focus && plan ? (
        <div className="mt-5 space-y-5">
          <FleetPanel plan={plan} locale={locale} />
          <div className="grid gap-5 xl:grid-cols-2">
            <TaskList plan={plan} filter={(k) => ["LOAD:OUT", "TRAVEL:OUT", "UNLOAD", "TRAVEL:RETURN", "DISMANTLE"].includes(k)} title="Loading, travel & unloading windows" description={focus.name} locale={locale} />
            <IssuesPanel issues={plan.issues.filter((i) => i.department === "LOGISTICS")} title="Transportation issues" />
          </div>
        </div>
      ) : focus ? <div className="mt-5"><NoPlan projectId={focus.id} canGenerate /></div> : null}
      <Card className="mt-5 min-w-0">
        <CardHeader><div><CardTitle>Vehicle assignments</CardTitle><CardDescription>Outbound, return and standby vehicles across projects</CardDescription></div></CardHeader>
        <TableWrap>
          <table className="data-table">
            <thead><tr><th>Vehicle</th><th>Project</th><th>Trip</th><th>Departure</th><th>Arrival</th><th className="num">Load kg</th><th className="num">Load m³</th><th>Status</th></tr></thead>
            <tbody>{trips.map((tr) => <tr key={tr.id}><td className="font-medium">{tr.vehicle.code} <span className="text-2xs text-muted-foreground">{tr.vehicle.type.toLowerCase().replace("_", " ")}</span></td><td className="text-xs">{tr.project.name}</td><td className="text-xs">{tr.isBackup ? <Badge variant="warning">standby backup</Badge> : tr.tripLabel}</td><td className="whitespace-nowrap text-xs">{fmtDateTime(tr.departureAt, locale)}</td><td className="whitespace-nowrap text-xs">{fmtDateTime(tr.arrivalAt, locale)}</td><td className="num">{fmtNumber(tr.loadedWeightKg)}</td><td className="num">{fmtNumber(tr.loadedVolumeM3, 1)}</td><td><StatusBadge status={tr.status} locale={locale} /></td></tr>)}</tbody>
          </table>
        </TableWrap>
      </Card>
    </>
  );
}

// ───────────────────────── Accommodation ─────────────────────────
export async function AccommodationWorkspace({ user, projectId }: WS) {
  const { t, locale } = await getDict();
  const { projects, plans, focus, focusPlan } = await departmentProjects(user, "ACCOMMODATION", projectId);
  const hotels = await db.hotel.findMany({ where: { companyId: user.companyId }, include: { roomTypes: true } });
  const all = await db.accommodationAssignment.findMany({ where: { projectId: { in: projects.map((p) => p.id) } }, include: { project: { select: { name: true } }, hotel: true }, orderBy: { checkIn: "asc" } });
  const plan = focusPlan?.plan;
  const nights = [...plans.values()].reduce((s, p) => s + p.plan.accommodation.roomNights, 0);
  const checkins = [...new Map(all.filter((a) => a.checkIn && a.checkIn > new Date()).map((a) => [`${a.checkIn!.toISOString().slice(0, 10)}|${a.hotel?.name}`, a])).values()];
  return (
    <>
      <PageHeader eyebrow={t.nav.accommodation} title="Accommodation workspace" description="Staff requirements, hotels, room allocation, rooming lists, check-in/out and confirmations."
        actions={<Button asChild><Link href={`/accommodation/rooming${focus ? `?project=${focus.id}` : ""}`}><BedDouble />Rooming list</Link></Button>} />
      <ProjectChips base="/accommodation" projects={projects} current={projectId} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Staff travelling" value={all.length} icon={Users} />
        <StatCard label="Rooms (focus)" value={plan?.accommodation.roomCount ?? "—"} icon={BedDouble} />
        <StatCard label="Room nights" value={nights} icon={CalendarCheck} sub="all projects" />
        <StatCard label="Unconfirmed bookings" value={all.filter((a) => a.bookingStatus !== "CONFIRMED").length} icon={AlertTriangle} tone="warning" />
        <StatCard label="Missing names" value={all.filter((a) => !a.guestName).length} icon={FileWarning} tone={all.some((a) => !a.guestName) ? "danger" : "success"} />
        <StatCard label="Hotels" value={hotels.length} icon={BedDouble} />
      </div>
      {plan && focus ? (
        <div className="mt-5 space-y-5">
          <RoomingPanel plan={plan} locale={locale} />
          <div className="grid gap-5 xl:grid-cols-2">
            <Card className="min-w-0">
              <CardHeader><div><CardTitle>Check-in schedule</CardTitle><CardDescription>Arrivals by date and hotel</CardDescription></div></CardHeader>
              <CardContent className="space-y-2">
                {checkins.map((a) => { const n = all.filter((x) => x.checkIn?.toISOString().slice(0, 10) === a.checkIn!.toISOString().slice(0, 10) && x.hotelId === a.hotelId).length; return <div key={a.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"><span>{fmtDate(a.checkIn, locale)} · {a.hotel?.name}</span><Badge variant="info">{n} guest(s)</Badge></div>; })}
                {checkins.length === 0 && <EmptyState title="No upcoming check-ins" className="border-0" />}
              </CardContent>
            </Card>
            <IssuesPanel issues={plan.issues.filter((i) => i.department === "ACCOMMODATION")} title="Rooming validation" />
          </div>
        </div>
      ) : null}
      <Card className="mt-5 min-w-0">
        <CardHeader><div><CardTitle>Hotels & room availability</CardTitle><CardDescription>Quotations / contracted rates (demo)</CardDescription></div></CardHeader>
        <TableWrap><table className="data-table"><thead><tr><th>Hotel</th><th>City</th><th>Room type</th><th className="num">Capacity</th><th className="num">Rate / night</th><th className="num">Available</th></tr></thead>
          <tbody>{hotels.flatMap((h) => h.roomTypes.map((r) => <tr key={r.id}><td className="font-medium">{h.name}</td><td>{h.city}</td><td>{r.name}</td><td className="num">{r.capacity}</td><td className="num">{fmtMoney(num(r.nightlyRate), r.currency, locale)}</td><td className="num">{r.roomsAvailable ?? "—"}</td></tr>))}</tbody></table></TableWrap>
      </Card>
    </>
  );
}

// ───────────────────────── Creative ─────────────────────────
export async function CreativeWorkspace({ user, projectId }: WS) {
  const { t, locale } = await getDict();
  const { projects, focus, focusPlan } = await departmentProjects(user, "CREATIVE", projectId);
  const items = await db.brandingItem.findMany({ where: { projectId: { in: projects.map((p) => p.id) } }, include: { project: { select: { name: true, id: true } }, vendor: true }, orderBy: { clientApprovalDeadline: "asc" } });
  const plan = focusPlan?.plan;
  return (
    <>
      <PageHeader eyebrow={t.nav.creative} title="Creative & branding workspace" description="Branding requirements, artwork, print specifications, client approvals and deadlines." actions={focus && <Button asChild><Link href={`/projects/${focus.id}/creative`}><Plus />Add branding item</Link></Button>} />
      <ProjectChips base="/creative" projects={projects} current={projectId} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Branding items" value={items.length} icon={Palette} />
        <StatCard label="Pending client approval" value={items.filter((i) => i.approvalStatus !== "APPROVED").length} icon={ClipboardCheck} tone="warning" />
        <StatCard label="Missing specifications" value={items.filter((i) => i.widthM == null || i.quantity == null).length} icon={FileWarning} tone={items.some((i) => i.quantity == null) ? "danger" : "success"} />
        <StatCard label="Print value" value={fmtMoney(items.reduce((s, i) => s + (num(i.unitCost) ?? 0) * (i.quantity ?? 0), 0), "EGP", locale)} icon={CircleDollarSign} />
      </div>
      <Card className="mt-5 min-w-0">
        <CardHeader><div><CardTitle>Printing BOQ & approval tracking</CardTitle><CardDescription>Dimensions and quantities are never invented — missing values are flagged</CardDescription></div></CardHeader>
        <TableWrap>
          <table className="data-table">
            <thead><tr><th>Item</th><th>Project</th><th>Size (m)</th><th className="num">Qty</th><th>Material / method</th><th>Vendor</th><th>Client approval</th><th>Delivery</th><th>Approval</th><th className="num">Value</th></tr></thead>
            <tbody>{items.map((i) => {
              const dd = i.clientApprovalDeadline ? daysUntil(i.clientApprovalDeadline) : null;
              return <tr key={i.id}><td className="min-w-[180px] font-medium">{i.name}</td><td className="text-xs">{i.project.name}</td><td className="text-xs tabular">{i.widthM != null ? `${i.widthM} × ${i.heightM}` : <span className="text-danger">missing</span>}</td><td className="num">{i.quantity ?? <span className="text-danger">?</span>}</td><td className="text-xs">{i.material} · {i.printMethod}</td><td className="text-xs">{i.vendor?.name ?? "—"}</td><td className={cn("whitespace-nowrap text-xs", dd != null && dd < 5 && i.approvalStatus !== "APPROVED" && "font-semibold text-danger")}>{fmtDate(i.clientApprovalDeadline, locale)}</td><td className="whitespace-nowrap text-xs">{fmtDate(i.deliveryDeadline, locale)}</td><td><StatusBadge status={i.approvalStatus} locale={locale} /></td><td className="num">{fmtMoney(i.quantity != null && num(i.unitCost) != null ? num(i.unitCost)! * i.quantity : null, i.currency, locale)}</td></tr>;
            })}</tbody>
          </table>
        </TableWrap>
      </Card>
      {plan && <div className="mt-5 grid gap-5 xl:grid-cols-2"><TaskList plan={plan} filter={(k) => k.startsWith("PRINT:") || k === "BRAND:INSTALL"} title="Print production & installation" locale={locale} /><IssuesPanel issues={plan.issues.filter((i) => i.department === "CREATIVE")} title="Creative — validation" /></div>}
    </>
  );
}

// ───────────────────────── Procurement ─────────────────────────
export async function ProcurementWorkspace({ user, projectId }: WS) {
  const { t, locale } = await getDict();
  const { projects, focus, focusPlan } = await departmentProjects(user, "PROCUREMENT", projectId);
  const { ProcurementBoard } = await import("@/components/departments/procurement-board");
  const requests = await db.procurementRequest.findMany({ where: { projectId: { in: projects.map((p) => p.id) } }, include: { project: { select: { name: true, id: true } }, vendor: true, quotes: { include: { vendor: true } } }, orderBy: { requiredByDate: "asc" } });
  const vendors = await db.vendor.findMany({ where: { companyId: user.companyId }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader eyebrow={t.nav.procurement} title="Procurement & vendors" description="Purchase requests, RFQs, quotations, supplier comparison, approvals and delivery tracking. Binding requests require human approval." />
      <ProjectChips base="/procurement" projects={projects} current={projectId} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Open requests" value={requests.filter((r) => !["DELIVERED", "CANCELLED"].includes(r.status)).length} icon={ShoppingCart} />
        <StatCard label="Pending approval" value={requests.filter((r) => r.status === "PENDING_APPROVAL").length} icon={ClipboardCheck} tone="warning" />
        <StatCard label="Order-by within 3 days" value={focusPlan ? focusPlan.plan.procurement.filter((p) => p.slackDays != null && p.slackDays <= 3).length : "—"} icon={AlertTriangle} tone="danger" />
        <StatCard label="Vendors" value={vendors.length} icon={Users} sub="demo vendor list" />
      </div>
      <div className="mt-5"><ProcurementBoard locale={locale} canManage={user.permissions.has("procurement.manage")} canApprove={user.permissions.has("procurement.approve")} vendors={vendors.map((v) => ({ id: v.id, name: v.name }))}
        requests={requests.map((r) => ({ id: r.id, code: r.code, item: r.item, project: r.project.name, projectId: r.project.id, quantity: r.quantity, unit: r.unit, requiredBy: r.requiredByDate?.toISOString() ?? null, vendor: r.vendor?.name ?? null, vendorId: r.vendorId, unitPrice: num(r.unitPrice), currency: r.currency, taxPct: r.taxPct, status: r.status, received: r.receivedQuantity, specifications: r.specifications, quotes: r.quotes.map((q) => ({ id: q.id, vendor: q.vendor.name, unitPrice: Number(q.unitPrice), currency: q.currency, leadTimeDays: q.leadTimeDays, status: q.status, validUntil: q.validUntil?.toISOString() ?? null })) }))} /></div>
      {focusPlan && <div className="mt-5"><ProcurementPlanTable plan={focusPlan.plan} locale={locale} /></div>}
      <Card className="mt-5 min-w-0">
        <CardHeader><div><CardTitle>Vendor database</CardTitle><CardDescription>Sample vendors are demo records — not approved Paradigm suppliers</CardDescription></div></CardHeader>
        <TableWrap><table className="data-table"><thead><tr><th>Vendor</th><th>Services</th><th>Location</th><th className="num">Lead time</th><th>Status</th></tr></thead><tbody>{vendors.map((v) => <tr key={v.id}><td className="font-medium">{v.name}</td><td className="text-xs">{v.services.join(", ")}</td><td>{v.location}</td><td className="num">{v.leadTimeDays ?? "—"} d</td><td><StatusBadge status={v.status} locale={locale} /></td></tr>)}</tbody></table></TableWrap>
      </Card>
      {focus && !focusPlan && <div className="mt-5"><NoPlan projectId={focus.id} canGenerate /></div>}
    </>
  );
}

// ───────────────────────── Account Management ─────────────────────────
export async function AccountWorkspace({ user, projectId }: WS) {
  const { t, locale } = await getDict();
  const { projects, plans } = await departmentProjects(user, "ACCOUNT", projectId);
  const [reqs, changes, branding] = await Promise.all([
    db.eventRequirement.findMany({ where: { projectId: { in: projects.map((p) => p.id) } }, include: { project: { select: { name: true } } } }),
    db.projectChange.findMany({ where: { projectId: { in: projects.map((p) => p.id) } }, include: { project: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.brandingItem.findMany({ where: { projectId: { in: projects.map((p) => p.id) }, approvalStatus: { not: "APPROVED" } }, include: { project: { select: { name: true } } } }),
  ]);
  return (
    <>
      <PageHeader eyebrow={t.nav.account} title="Account management" description="Client projects, briefs, scope, deliverables, department progress, client approvals and scope changes."
        actions={user.permissions.has("project.create") && <Button asChild><Link href="/projects/new"><Plus />{t.header.newProject}</Link></Button>} />
      <ProjectChips base="/account" projects={projects} current={projectId} />
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {projects.map((p) => {
          const plan = plans.get(p.id)?.plan;
          const approved = p.departments.filter((d) => d.status === "APPROVED").length;
          return (
            <Card key={p.id} className="min-w-0">
              <CardHeader><div className="min-w-0"><CardTitle className="truncate"><Link href={`/projects/${p.id}`} className="hover:text-primary">{p.name}</Link></CardTitle><CardDescription>{p.client} · {p.participants} participants · {p.location}</CardDescription></div><StatusBadge status={p.status} locale={locale} /></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Event</span><span>{fmtDate(p.eventStart, locale)} ({daysUntil(p.eventStart)} days)</span></div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Department progress</span><span>{approved}/{p.departments.length} approved</span></div>
                <div className="flex flex-wrap gap-1">{p.departments.map((d) => <StatusBadge key={d.id} status={d.status} locale={locale} className="!font-medium" />)}</div>
                {plan && <div className="flex justify-between text-xs"><span className="text-muted-foreground">Planned cost</span><span className="tabular">{fmtMoney(plan.budget.totalInBudgetCurrency, p.currency, locale)} / {fmtMoney(num(p.budgetAmount), p.currency, locale)}</span></div>}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2"><CardHeader><div><CardTitle>Scope of work & client deliverables</CardTitle></div></CardHeader>
          <TableWrap><table className="data-table"><thead><tr><th>Project</th><th>Category</th><th>Requirement</th><th className="num">Qty</th><th>Status</th></tr></thead><tbody>{reqs.map((r) => <tr key={r.id}><td className="text-xs">{r.project.name}</td><td className="text-xs">{r.category}</td><td>{r.title}</td><td className="num">{r.quantity ?? "—"} {r.unit}</td><td><StatusBadge status={r.status} locale={locale} /></td></tr>)}</tbody></table></TableWrap>
        </Card>
        <div className="space-y-5">
          <Card className="min-w-0"><CardHeader><CardTitle>Pending client approvals</CardTitle></CardHeader><CardContent className="space-y-2">{branding.map((b) => <div key={b.id} className="text-sm"><div className="font-medium">{b.name}</div><div className="text-2xs text-muted-foreground">{b.project.name} · due {fmtDate(b.clientApprovalDeadline, locale)}</div></div>)}{branding.length === 0 && <div className="text-xs text-muted-foreground">None</div>}</CardContent></Card>
          <Card className="min-w-0"><CardHeader><CardTitle>Scope changes</CardTitle></CardHeader><CardContent className="space-y-2">{changes.map((c) => <div key={c.id} className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{c.title}</span><StatusBadge status={c.status} locale={locale} /></div>)}{changes.length === 0 && <div className="text-xs text-muted-foreground">No scope changes recorded</div>}</CardContent></Card>
        </div>
      </div>
      <div className="mt-5"><DemoBanner /></div>
    </>
  );
}
