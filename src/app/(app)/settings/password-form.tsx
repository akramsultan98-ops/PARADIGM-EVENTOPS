"use client";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { changePasswordAction } from "@/server/actions/users";
export function PasswordForm() {
  const [pending, start] = useTransition();
  return (
    <form className="grid gap-2 border-t pt-4 sm:grid-cols-[1fr_1fr_auto]" action={(f) => start(async () => { const r = await changePasswordAction(String(f.get("current")), String(f.get("next"))); if (r.ok) toast("Password changed"); else toast(r.error, { tone: "error" }); })}>
      <Field label="Current password"><Input name="current" type="password" required autoComplete="current-password" /></Field>
      <Field label="New password"><Input name="next" type="password" required minLength={10} autoComplete="new-password" /></Field>
      <div className="flex items-end"><Button type="submit" disabled={pending}>Change</Button></div>
    </form>
  );
}
