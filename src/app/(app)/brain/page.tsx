import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { getDict } from "@/i18n/server";
import { listMemories } from "@/server/services/brain";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/kit";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime } from "@/lib/format";
import type { Workspace } from "@/brain/types";
import { MemoryActions, TeachBox } from "./client";

export const metadata = { title: "Memory & Learning" };

const WORKSPACES: { key: Workspace; label: string; note: string }[] = [
  { key: "PARADIGM", label: "Paradigm", note: "Company work. Visible to you; shared only when a standards approver publishes it." },
  { key: "PERSONAL", label: "Personal", note: "Only you. Never mixed into Paradigm answers." },
  { key: "DEVELOPMENT", label: "AI & Development", note: "Only you. Projects, infrastructure, experiments." },
];

export default async function BrainPage({ searchParams }: { searchParams: Promise<{ ws?: string }> }) {
  const u = await requirePermission("brain.use");
  const { t, locale } = await getDict();
  const requested = (await searchParams).ws;
  const ws = (WORKSPACES.find((w) => w.key === requested)?.key ?? "PARADIGM") as Workspace;
  const all = await listMemories(u, ws);
  const pending = all.filter((m) => m.approval === "PROPOSED");
  const active = all.filter((m) => m.approval === "APPROVED" && m.validity === "ACTIVE");
  const history = all.filter((m) => !pending.includes(m) && !active.includes(m));
  const scopeLabel = (s: { client?: string; sector?: string }) => (s.client ? `client: ${s.client}` : s.sector ? `sector: ${s.sector}` : "everywhere");

  return (
    <>
      <PageHeader title={t.nav.brain} description="What the Brain has learned from you. Nothing is used until you approve it; every change keeps its history and every use is recorded." />
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Workspace">
        {WORKSPACES.map((w) => <Link key={w.key} href={`/brain?ws=${w.key}`} className={`rounded-full border px-3 py-1 text-xs font-medium ${w.key === ws ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>{w.label}</Link>)}
        <span className="self-center text-2xs text-muted-foreground">{WORKSPACES.find((w) => w.key === ws)!.note}</span>
      </nav>

      <Card className="mb-5"><CardHeader><div><CardTitle>Teach the Brain</CardTitle><CardDescription>Start with “Remember…”, “From now on…” or “Always…”. It proposes; you approve.</CardDescription></div></CardHeader><TeachBox workspace={ws} /></Card>

      <Card className="mb-5 min-w-0">
        <CardHeader><div><CardTitle>Waiting for your approval ({pending.length})</CardTitle><CardDescription>Assumptions must be confirmed explicitly; contradictions need your decision.</CardDescription></div></CardHeader>
        {pending.length === 0 ? <EmptyState title="Nothing waiting" className="m-4" /> : <div className="divide-y">{pending.map((m) => (
          <div key={m.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{m.title}</span><Badge variant={m.kind === "ASSUMPTION" || m.kind === "SUGGESTION" ? "warning" : "secondary"}>{m.kind}</Badge><Badge variant="outline">{m.category.replace(/_/g, " ").toLowerCase()}</Badge><Badge variant="outline">{scopeLabel(m.scope)}</Badge>{m.validity === "CONFLICTED" ? <Badge variant="danger">conflicts with an approved memory</Badge> : null}</div>
              <p className="text-xs text-muted-foreground">Evidence: “{m.evidence}” · confidence {Math.round(m.confidence * 100)}% · {fmtDateTime(m.createdAt, locale)}</p>
            </div>
            <MemoryActions id={m.id} mode="pending" kind={m.kind} conflicted={m.validity === "CONFLICTED"} content={m.content} />
          </div>
        ))}</div>}
      </Card>

      <Card className="mb-5 min-w-0">
        <CardHeader><div><CardTitle>Approved knowledge ({active.length})</CardTitle><CardDescription>Applied when the situation matches its scope. Uses = times it influenced an answer or draft.</CardDescription></div></CardHeader>
        {active.length === 0 ? <EmptyState title="Nothing approved yet" className="m-4" /> : <div className="divide-y">{active.map((m) => (
          <div key={m.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{m.title}</span><Badge variant="success">{m.kind}</Badge><Badge variant="outline">{scopeLabel(m.scope)}</Badge><Badge variant="outline">v{m.version}</Badge>{m.shared ? <Badge variant="violet">shared</Badge> : null}{!m.mine ? <Badge variant="secondary">company</Badge> : null}</div>
              <p className="text-sm">{m.content}</p>
              <p className="text-2xs text-muted-foreground">id {m.id} · used {m.uses}× · last validated {fmtDateTime(m.lastValidatedAt, locale)}</p>
            </div>
            {m.mine ? <MemoryActions id={m.id} mode="active" kind={m.kind} conflicted={false} content={m.content} /> : null}
          </div>
        ))}</div>}
      </Card>

      {history.length ? <Card className="min-w-0"><CardHeader><CardTitle>History ({history.length})</CardTitle></CardHeader><div className="divide-y text-xs">{history.map((m) => <div key={m.id} className="flex flex-wrap items-center gap-2 px-5 py-2"><Badge variant="secondary">{m.validity === "SUPERSEDED" ? "SUPERSEDED" : m.approval}</Badge><span>{m.title}</span><span className="text-muted-foreground">v{m.version}</span></div>)}</div></Card> : null}
    </>
  );
}
