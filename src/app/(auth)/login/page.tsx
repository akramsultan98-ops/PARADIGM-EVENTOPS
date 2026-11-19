import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getDict } from "@/i18n/server";
import { ParadigmLogo } from "@/components/brand/logo";
import { BRAND } from "@/config/brand";
import { LoginForm } from "./login-form";
import { ROLE_LABELS } from "@/lib/permissions";

export const metadata = { title: "Sign in" };

const DEMO = ["pm", "account", "production", "production.member", "av", "logistics", "accommodation", "creative", "procurement", "finance", "admin", "viewer"];
const DEMO_ROLES: Record<string, string> = { pm: "PROJECT_MANAGER", account: "ACCOUNT_MANAGER", production: "PRODUCTION_MANAGER", "production.member": "DEPARTMENT_MEMBER", av: "AV_MANAGER", logistics: "LOGISTICS_MANAGER", accommodation: "ACCOMMODATION_MANAGER", creative: "CREATIVE_MANAGER", procurement: "PROCUREMENT_MANAGER", finance: "FINANCE", admin: "SUPER_ADMIN", viewer: "VIEWER" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { t } = await getDict();
  const { next } = await searchParams;
  const demo = process.env.ENABLE_DEMO_LOGIN === "true" ? DEMO.map((k) => ({ email: `${k}@demo.eventops.local`, role: ROLE_LABELS[DEMO_ROLES[k]] })) : [];
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <section className="relative flex flex-col justify-between overflow-hidden bg-brand-navy px-6 py-8 text-white sm:px-10 lg:px-14 lg:py-12">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "linear-gradient(hsl(var(--brand-cyan)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--brand-cyan)) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
        <div className="relative flex items-center justify-between lg:block">
          <ParadigmLogo height={64} priority className="lg:hidden" />
          <div className="hidden lg:block"><ParadigmLogo height={120} priority /></div>
        </div>
        <div className="relative mt-8 lg:mt-0">
          <div className="font-display text-xs font-semibold tracking-[0.35em] text-brand-cyan">EVENTOPS</div>
          <h1 className="mt-3 max-w-xl font-display text-2xl font-semibold leading-tight sm:text-3xl lg:text-4xl">{t.app.subtitle}</h1>
          <p className="mt-3 max-w-lg text-sm text-brand-cyan-pale/80 sm:text-base">{t.app.tagline}</p>
          <ul className="mt-8 hidden max-w-lg grid-cols-2 gap-3 text-xs text-brand-cyan-pale/80 sm:grid">
            {["Department inputs → validated plan", "Deterministic BOQ & manpower", "Calendar-aware scheduling", "Live execution vs plan"].map((x) => (
              <li key={x} className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-brand-cyan" />{x}</li>
            ))}
          </ul>
        </div>
        <div className="relative mt-8 hidden text-2xs uppercase tracking-[0.2em] text-brand-cyan-pale/50 lg:block">{t.login.internal}</div>
      </section>
      <section className="flex items-center justify-center bg-background px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <h2 className="font-display text-xl font-semibold">{t.login.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t.login.subtitle}</p>
          <LoginForm next={next} demo={demo} labels={{ email: t.login.email, password: t.login.password, signIn: t.login.signIn, invalid: t.login.invalid, demoAccounts: t.login.demoAccounts }} />
          <p className="mt-8 text-center text-2xs text-muted-foreground">{BRAND.product} · {BRAND.organization}</p>
        </div>
      </section>
    </div>
  );
}
