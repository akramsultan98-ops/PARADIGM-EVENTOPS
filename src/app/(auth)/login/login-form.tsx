"use client";
import { useActionState, useRef } from "react";
import { Loader2, LogIn } from "lucide-react";
import { loginAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";

export function LoginForm({ next, demo, demoPassword, labels }: { next?: string; demo: { email: string; role: string }[]; demoPassword?: string; labels: Record<string, string> }) {
  const [state, action, pending] = useActionState(loginAction, {});
  const email = useRef<HTMLInputElement>(null);
  const pass = useRef<HTMLInputElement>(null);
  return (
    <>
      <form action={action} className="mt-6 space-y-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <Field label={labels.email}><Input ref={email} name="email" type="email" autoComplete="username" required placeholder="name@paradigm…" /></Field>
        <Field label={labels.password}><Input ref={pass} name="password" type="password" autoComplete="current-password" required /></Field>
        {state?.error && <div role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">{state.error === "invalid" ? labels.invalid : state.error}</div>}
        <Button type="submit" className="w-full" size="lg" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <LogIn className="rtl:-scale-x-100" />}{labels.signIn}</Button>
      </form>
      {demo.length > 0 && (
        <div className="mt-8 rounded-lg border border-dashed border-warning/40 bg-warning-soft/40 p-3">
          <div className="text-2xs font-semibold uppercase tracking-wider text-warning">{labels.demoAccounts}</div>
          <p className="mt-1 text-2xs text-muted-foreground">Development only · password <code className="rounded bg-card px-1">{demoPassword}</code></p>
          <div className="mt-2 grid grid-cols-2 gap-1">
            {demo.map((d) => (
              <button key={d.email} type="button" className="truncate rounded px-2 py-1 text-start text-xs hover:bg-card" onClick={() => { if (email.current) email.current.value = d.email; if (pass.current) pass.current.value = demoPassword ?? ""; }}>
                {d.role}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
