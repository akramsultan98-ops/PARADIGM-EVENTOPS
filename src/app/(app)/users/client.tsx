"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { createUserAction, updateUserRoleAction } from "@/server/actions/users";

export function CreateUser({ roles, departments }: { roles: { key: string; name: string }[]; departments: { key: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setTemp(null); }}>
      <DialogTrigger asChild><Button><UserPlus />Add user</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add user</DialogTitle></DialogHeader>
        {temp ? <DialogBody><p className="text-sm">Temporary password (shown once):</p><code className="mt-2 block rounded bg-muted p-3 text-sm">{temp}</code><p className="mt-2 text-2xs text-muted-foreground">Share it through a secure channel; the user should change it in Settings.</p></DialogBody> : (
          <form action={(f) => start(async () => { const r = await createUserAction({ name: String(f.get("name")), email: String(f.get("email")), roleKey: String(f.get("role")), departmentKey: String(f.get("dept")) || undefined, jobTitle: String(f.get("title")) || undefined }); if (r.ok) { setTemp((r.data as { temporaryPassword: string }).temporaryPassword); router.refresh(); } else toast(r.error, { tone: "error" }); })}>
            <DialogBody className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name" required><Input name="name" required /></Field>
              <Field label="Work email" required><Input name="email" type="email" required /></Field>
              <Field label="Role"><NativeSelect name="role" defaultValue="DEPARTMENT_MEMBER">{roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</NativeSelect></Field>
              <Field label="Department"><NativeSelect name="dept"><option value="">—</option>{departments.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}</NativeSelect></Field>
              <Field label="Job title" className="sm:col-span-2"><Input name="title" /></Field>
            </DialogBody>
            <DialogFooter><Button type="submit" disabled={pending}>Create</Button></DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function UserRow({ userId, roleKey, active, roles, self }: { userId: string; roleKey: string; active: boolean; roles: { key: string; name: string }[]; self: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const go = (r: string, a: boolean) => start(async () => { const res = await updateUserRoleAction(userId, r, a); if (res.ok) { toast(res.message ?? "Updated"); router.refresh(); } else toast(res.error, { tone: "error" }); });
  return (
    <div className="flex items-center gap-2">
      <NativeSelect className="h-8 w-48 text-xs" disabled={pending || self} defaultValue={roleKey} onChange={(e) => go(e.target.value, active)}>{roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</NativeSelect>
      <Button size="sm" variant={active ? "outline" : "success"} disabled={pending || self} onClick={() => go(roleKey, !active)}>{active ? "Deactivate" : "Activate"}</Button>
    </div>
  );
}
