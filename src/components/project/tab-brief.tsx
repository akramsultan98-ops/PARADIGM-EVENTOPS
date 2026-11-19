import { db } from "@/lib/db";
import { projectContext } from "@/server/queries/project";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyValue, StatusBadge, TableWrap, Avatar } from "@/components/ui/kit";
import { fmtDateTime } from "@/lib/format";
import { AddRequirementForm } from "./forms";

export async function BriefTab({ id }: { id: string }) {
  const { u, locale, project: p } = await projectContext(id);
  const reqs = await db.eventRequirement.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" } });
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <div className="min-w-0 space-y-5 xl:col-span-2">
        <Card><CardHeader><CardTitle>Event brief</CardTitle></CardHeader><CardContent><p className="whitespace-pre-line text-sm leading-relaxed">{p.description ?? "No brief recorded."}</p></CardContent></Card>
        <Card className="min-w-0">
          <CardHeader><div><CardTitle>Scope of work & client requirements</CardTitle><CardDescription>Owned by Account Management</CardDescription></div></CardHeader>
          <TableWrap><table className="data-table"><thead><tr><th>Category</th><th>Requirement</th><th className="num">Qty</th><th>Status</th></tr></thead><tbody>{reqs.map((r) => <tr key={r.id}><td className="text-xs">{r.category}</td><td>{r.title}{r.description && <div className="text-2xs text-muted-foreground">{r.description}</div>}</td><td className="num">{r.quantity ?? "—"} {r.unit}</td><td><StatusBadge status={r.status} locale={locale} /></td></tr>)}</tbody></table></TableWrap>
          {u.permissions.has("project.edit") && <CardContent className="border-t"><AddRequirementForm projectId={id} /></CardContent>}
        </Card>
      </div>
      <div className="space-y-5">
        <Card><CardHeader><CardTitle>Event</CardTitle></CardHeader><CardContent><KeyValue cols={1} items={[["Client", p.client], ["Category", p.category], ["Participants", p.participants], ["Setup", `${fmtDateTime(p.setupStart, locale)} → ${fmtDateTime(p.setupEnd, locale)}`], ["Event", `${fmtDateTime(p.eventStart, locale)} → ${fmtDateTime(p.eventEnd, locale)}`], ["Dismantle", p.dismantleEnd ? `until ${fmtDateTime(p.dismantleEnd, locale)}` : "—"]]} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Venue</CardTitle></CardHeader><CardContent>{p.venue ? <KeyValue cols={1} items={[["Name", p.venue.name], ["City", p.venue.city], ["Daily access", `${p.venue.accessOpens ?? "?"} – ${p.venue.accessCloses ?? "?"}`], ["Power capacity", p.venue.powerCapacityKw != null ? `${p.venue.powerCapacityKw} kW` : "Unknown — AV must confirm"], ["Loading dock", p.venue.loadingDock ? "Yes" : "No"], ["Notes", p.venue.accessNotes]]} /> : <p className="text-sm text-muted-foreground">Venue not confirmed.</p>}</CardContent></Card>
        <Card><CardHeader><CardTitle>Project team</CardTitle></CardHeader><CardContent className="space-y-2">{p.members.map((m) => <div key={m.userId} className="flex items-center gap-2"><Avatar name={m.user.name} /><div className="min-w-0"><div className="truncate text-sm font-medium">{m.user.name}</div><div className="text-2xs text-muted-foreground">{m.role} · {m.user.role.name}</div></div></div>)}</CardContent></Card>
      </div>
    </div>
  );
}
