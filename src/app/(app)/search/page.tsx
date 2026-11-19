import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projectScope } from "@/lib/scope";
import { getDict } from "@/i18n/server";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/kit";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const u = await requireUser();
  const { t } = await getDict();
  const q = ((await searchParams).q ?? "").trim().slice(0, 100);
  const c = { contains: q, mode: "insensitive" as const };
  const scope = projectScope(u);
  const [projects, tasks, items, docs, materials, vendors] = q.length < 2 ? [[], [], [], [], [], []] : await Promise.all([
    db.project.findMany({ where: { ...scope, OR: [{ name: c }, { client: c }, { code: c }, { location: c }] }, take: 10 }),
    db.task.findMany({ where: { project: scope, name: c }, include: { project: { select: { name: true, id: true } } }, take: 15 }),
    db.productionItem.findMany({ where: { project: scope, OR: [{ name: c }, { code: c }] }, include: { project: { select: { name: true, id: true } } }, take: 10 }),
    db.uploadedDocument.findMany({ where: { companyId: u.companyId, OR: [{ projectId: null }, { project: scope }], fileName: c }, take: 10 }),
    db.material.findMany({ where: { companyId: u.companyId, OR: [{ name: c }, { code: c }] }, take: 10 }),
    db.vendor.findMany({ where: { companyId: u.companyId, name: c }, take: 10 }),
  ]);
  const groups: [string, { href: string; title: string; sub: string }[]][] = [
    ["Projects", projects.map((p) => ({ href: `/projects/${p.id}`, title: p.name, sub: `${p.code} · ${p.client}` }))],
    ["Tasks", tasks.map((x) => ({ href: `/projects/${x.project.id}/timeline`, title: x.name, sub: x.project.name }))],
    ["Production items", items.map((x) => ({ href: `/projects/${x.project.id}/production`, title: `${x.code} ${x.name}`, sub: x.project.name }))],
    ["Documents", docs.map((d) => ({ href: `/api/documents/${d.id}`, title: d.fileName, sub: d.category }))],
    ["Materials", materials.map((m) => ({ href: "/knowledge", title: `${m.code} ${m.name}`, sub: m.category }))],
    ["Vendors", vendors.map((v) => ({ href: "/procurement", title: v.name, sub: v.services.join(", ") }))],
  ];
  return (
    <>
      <PageHeader title={t.common.search} />
      <form className="mb-5"><input name="q" defaultValue={q} autoFocus placeholder={t.header.search} className="h-10 w-full max-w-xl rounded-md border bg-card px-3 text-sm" /></form>
      {q.length < 2 ? <EmptyState title="Type at least 2 characters" /> : groups.every(([, r]) => !r.length) ? <EmptyState title={`No results for “${q}”`} /> : (
        <div className="grid gap-4 lg:grid-cols-2">{groups.filter(([, r]) => r.length).map(([g, r]) => <Card key={g}><CardHeader><CardTitle>{g}</CardTitle></CardHeader><ul className="divide-y">{r.map((x, i) => <li key={i}><Link href={x.href} className="block px-5 py-2.5 hover:bg-muted"><div className="text-sm font-medium">{x.title}</div><div className="text-2xs text-muted-foreground">{x.sub}</div></Link></li>)}</ul></Card>)}</div>
      )}
    </>
  );
}
