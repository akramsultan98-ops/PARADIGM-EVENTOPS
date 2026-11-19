import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projectScope } from "@/lib/scope";
import { getDict } from "@/i18n/server";
import { PageHeader } from "@/components/ui/kit";
import { RiskRegister } from "@/components/project/tab-control";

export const metadata = { title: "Risk management" };

export default async function RisksPage() {
  const u = await requireUser();
  const { t, locale } = await getDict();
  const risks = await db.risk.findMany({ where: { project: { ...projectScope(u), status: { notIn: ["CANCELLED", "COMPLETED"] } } }, include: { owner: { select: { name: true } }, department: true, project: { select: { name: true, id: true } } }, orderBy: { severity: "desc" } });
  return (<><PageHeader title={t.nav.risks} description="Operational risk register with triggers, warning signs, immediate actions, Plan B, owners and impacts across all active projects." /><RiskRegister risks={risks} locale={locale} canEdit={u.permissions.has("risk.manage")} showProject /></>);
}
