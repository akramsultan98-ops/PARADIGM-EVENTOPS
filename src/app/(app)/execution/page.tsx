import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { canReadFinancials } from "@/lib/financial";
import { db } from "@/lib/db";
import { projectScope } from "@/lib/scope";
import { getDict } from "@/i18n/server";
import { executionData } from "@/server/queries/execution";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui/kit";
import { Button } from "@/components/ui/button";
import { ExecutionBoard } from "@/components/execution/execution-board";
import { ExecutionFeed } from "@/components/project/tab-control";
import { ProjectPicker } from "../_project-picker";

export const metadata = { title: "Live execution" };

export default async function ExecutionPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const u = await requireUser();
  const { t, locale } = await getDict();
  const { project } = await searchParams;
  const projects = await db.project.findMany({ where: { ...projectScope(u), status: { in: ["APPROVED", "IN_PREPARATION", "IN_EXECUTION", "UNDER_REVIEW"] } }, orderBy: [{ status: "desc" }, { eventStart: "asc" }] });
  const current = projects.find((p) => p.id === project) ?? projects.find((p) => p.status === "IN_EXECUTION") ?? projects[0];
  if (!current) return <><PageHeader title={t.nav.execution} /><EmptyState title="No approved projects yet" description="Execution tracking starts once a master plan is approved." /></>;
  const d = await executionData(current.id, canReadFinancials(u));
  return (
    <>
      <PageHeader title={t.nav.execution} description="Site execution: task status, actual times, consumption, delays, photos and inspections — compared live against the approved plan."
        actions={<><StatusBadge status={current.status} locale={locale} /><Button variant="outline" asChild><Link href={`/execution/actual-vs-planned?project=${current.id}`}>Actual vs planned</Link></Button></>} />
      <ProjectPicker base="/execution" projects={projects.map((p) => ({ id: p.id, name: p.name }))} current={current.id} />
      <div className="space-y-5">
        <ExecutionBoard projectId={current.id} tasks={d.tasks} plannedActuals={d.plannedActuals} canUpdate={u.permissions.has("execution.update")} now={new Date().toISOString()} active={d.active} />
        <ExecutionFeed updates={d.updates} locale={locale} />
      </div>
    </>
  );
}
