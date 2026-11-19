import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getDict } from "@/i18n/server";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/kit";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime } from "@/lib/format";
import { MarkAllRead } from "./mark-all";
import { cn } from "@/lib/utils";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const u = await requireUser();
  const { t, locale } = await getDict();
  const items = await db.notification.findMany({ where: { userId: u.id }, include: { project: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <>
      <PageHeader title={t.nav.notifications} description="Approvals, missing submissions, deadlines, task assignments, schedule changes, procurement and risk alerts." actions={<MarkAllRead />} />
      {items.length === 0 ? <EmptyState title="No notifications" /> : <Card className="divide-y">{items.map((n) => (
        <Link key={n.id} href={n.link ?? "#"} className={cn("flex items-start gap-3 px-5 py-3 hover:bg-muted/50", !n.readAt && "bg-accent/30")}>
          <span className={cn("mt-2 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-brand-cyan")} />
          <div className="min-w-0 flex-1"><div className={cn("text-sm", !n.readAt && "font-semibold")}>{n.title}</div>{n.body && <div className="text-xs text-muted-foreground">{n.body}</div>}<div className="mt-0.5 text-2xs text-muted-foreground">{n.project?.name ?? "Company"} · {fmtDateTime(n.createdAt, locale)}</div></div>
          <Badge variant="secondary">{n.type.toLowerCase().replace("_", " ")}</Badge>
        </Link>
      ))}</Card>}
    </>
  );
}
