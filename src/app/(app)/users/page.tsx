import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getDict } from "@/i18n/server";
import { PERMISSIONS, ROLE_PERMISSIONS, ROLE_LABELS } from "@/lib/permissions";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, TableWrap, Avatar } from "@/components/ui/kit";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime } from "@/lib/format";
import { CreateUser, UserRow } from "./client";

export const metadata = { title: "Users & roles" };

export default async function UsersPage() {
  const u = await requirePermission("users.manage");
  const { t, locale } = await getDict();
  const [users, roles, depts] = await Promise.all([
    db.user.findMany({ where: { companyId: u.companyId, deletedAt: null }, include: { role: true, memberships: { include: { department: true } } }, orderBy: { name: "asc" } }),
    db.role.findMany({ where: { companyId: u.companyId }, include: { permissions: { include: { permission: true } } } }),
    db.department.findMany({ where: { companyId: u.companyId }, orderBy: { name: "asc" } }),
  ]);
  const roleKeys = Object.keys(ROLE_LABELS);
  return (
    <>
      <PageHeader title={t.nav.users} description="Accounts, roles and department memberships. Role changes and deactivation revoke active sessions immediately. Permissions are enforced on the server." actions={<CreateUser roles={roleKeys.map((k) => ({ key: k, name: ROLE_LABELS[k] }))} departments={depts.map((d) => ({ key: d.key, name: d.name }))} />} />
      <Card className="mb-5 min-w-0">
        <TableWrap><table className="data-table"><thead><tr><th>User</th><th>Department</th><th>Last login</th><th>Role · status</th></tr></thead>
          <tbody>{users.map((x) => <tr key={x.id}><td><div className="flex items-center gap-2"><Avatar name={x.name} /><div><div className="font-medium">{x.name}{x.isDemo && <Badge variant="demo" className="ms-2">demo</Badge>}</div><div className="text-2xs text-muted-foreground">{x.email} · {x.jobTitle}</div></div></div></td><td className="text-xs">{x.memberships.map((m) => `${m.department.name}${m.isManager ? " (manager)" : ""}`).join(", ") || "—"}</td><td className="text-xs">{fmtDateTime(x.lastLoginAt, locale)}</td><td><UserRow userId={x.id} roleKey={x.role.key} active={x.active} roles={roleKeys.map((k) => ({ key: k, name: ROLE_LABELS[k] }))} self={x.id === u.id} /></td></tr>)}</tbody></table></TableWrap>
      </Card>
      <Card className="min-w-0">
        <CardHeader><div><CardTitle>Permission matrix</CardTitle><CardDescription>Stored per role in the database; seeded from the platform defaults</CardDescription></div></CardHeader>
        <TableWrap><table className="data-table text-xs"><thead><tr><th>Permission</th>{roleKeys.map((k) => <th key={k} className="text-center">{ROLE_LABELS[k].replace(" Manager", " Mgr")}</th>)}</tr></thead>
          <tbody>{Object.entries(PERMISSIONS).map(([p, desc]) => <tr key={p}><td><div className="font-mono text-2xs">{p}</div><div className="text-2xs text-muted-foreground">{desc}</div></td>{roleKeys.map((k) => { const has = roles.find((r) => r.key === k)?.permissions.some((rp) => rp.permission.key === p) ?? ROLE_PERMISSIONS[k]?.includes(p as never); return <td key={k} className="text-center">{has ? <span className="text-success">●</span> : <span className="text-muted-foreground/30">·</span>}</td>; })}</tr>)}</tbody></table></TableWrap>
      </Card>
    </>
  );
}
