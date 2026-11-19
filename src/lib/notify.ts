import "server-only";
import { db } from "@/lib/db";

export interface NotifyInput { companyId: string; projectId?: string | null; type: string; title: string; body?: string; link?: string }

/** In-app notifications to users (by id, by role key, or by department key). Optional n8n webhook fan-out. */
export async function notify(target: { userIds?: string[]; roles?: string[]; departments?: string[] }, n: NotifyInput) {
  const ids = new Set(target.userIds ?? []);
  if (target.roles?.length || target.departments?.length) {
    const users = await db.user.findMany({
      where: { companyId: n.companyId, active: true, deletedAt: null, OR: [target.roles?.length ? { role: { key: { in: target.roles } } } : undefined, target.departments?.length ? { memberships: { some: { department: { key: { in: target.departments } } } } } : undefined].filter(Boolean) as object[] },
      select: { id: true },
    });
    users.forEach((u) => ids.add(u.id));
  }
  if (!ids.size) return 0;
  await db.notification.createMany({ data: [...ids].map((userId) => ({ companyId: n.companyId, userId, projectId: n.projectId ?? null, type: n.type, title: n.title, body: n.body, link: n.link })) });
  const hook = process.env.N8N_WEBHOOK_URL;
  if (hook) {
    // optional integration — failures never affect core operations
    fetch(hook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...n, recipients: [...ids] }), signal: AbortSignal.timeout(3000) }).catch(() => undefined);
  }
  return ids.size;
}
