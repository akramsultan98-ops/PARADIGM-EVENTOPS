import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getDict } from "@/i18n/server";
import { aiEnabled, MODEL } from "@/ai/provider";
import { BRAND } from "@/config/brand";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyValue, PageHeader } from "@/components/ui/kit";
import { Badge } from "@/components/ui/badge";
import { ParadigmLogo } from "@/components/brand/logo";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const u = await requireUser();
  const { t, locale } = await getDict();
  const company = await db.company.findUniqueOrThrow({ where: { id: u.companyId } });
  const status = (ok: boolean, on: string, off: string) => <Badge variant={ok ? "success" : "secondary"}>{ok ? on : off}</Badge>;
  return (
    <>
      <PageHeader title={t.nav.settings} description="Your profile, company configuration and integration status." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Profile</CardTitle></CardHeader><CardContent className="space-y-4"><KeyValue items={[["Name", u.name], ["Email", u.email], ["Role", u.roleName], ["Departments", u.departments.map((d) => d.name).join(", ") || "—"], ["Language", locale === "ar" ? "العربية" : "English"], ["Permissions", `${u.permissions.size} granted`]]} /><PasswordForm /></CardContent></Card>
        <Card><CardHeader><CardTitle>Company</CardTitle><CardDescription>Tenant configuration (company-level data isolation)</CardDescription></CardHeader><CardContent className="space-y-4"><div className="inline-block rounded-md bg-brand-navy p-4"><ParadigmLogo height={64} /></div><KeyValue items={[["Organisation", company.name], ["Product", BRAND.product], ["Country", company.country], ["Default currency", company.defaultCurrency], ["Timezone", company.timezone], ["Logo asset", BRAND.logo.fullWhiteHiRes]]} /></CardContent></Card>
        <Card className="lg:col-span-2"><CardHeader><CardTitle>Integrations & services</CardTitle><CardDescription>External services are optional — core operations never depend on them</CardDescription></CardHeader>
          <CardContent><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-md border p-3"><div className="text-sm font-semibold">AI provider</div><div className="mt-1">{status(aiEnabled(), `Anthropic Claude · ${MODEL()}`, "Not configured — rule-based mode")}</div><p className="mt-1 text-2xs text-muted-foreground">Set ANTHROPIC_API_KEY. Numbers always come from deterministic engines.</p></div>
            <div className="rounded-md border p-3"><div className="text-sm font-semibold">File storage</div><div className="mt-1">{status(true, process.env.STORAGE_DRIVER === "s3" ? "S3 (adapter required)" : "Local volume", "")}</div><p className="mt-1 text-2xs text-muted-foreground">Uploads validated, hashed and served only to authorised users.</p></div>
            <div className="rounded-md border p-3"><div className="text-sm font-semibold">Optimisation service</div><div className="mt-1">{status(!!process.env.OPTIMIZER_URL, "OR-Tools service connected", "Built-in CPM + SGS scheduler")}</div><p className="mt-1 text-2xs text-muted-foreground">Optional Python OR-Tools service (services/optimizer).</p></div>
            <div className="rounded-md border p-3"><div className="text-sm font-semibold">n8n webhooks</div><div className="mt-1">{status(!!process.env.N8N_WEBHOOK_URL, "Enabled", "Disabled")}</div><p className="mt-1 text-2xs text-muted-foreground">Optional bridge to WhatsApp / email.</p></div>
            <div className="rounded-md border p-3"><div className="text-sm font-semibold">Demo login</div><div className="mt-1">{status(process.env.ENABLE_DEMO_LOGIN === "true", "Enabled (development)", "Disabled")}</div><p className="mt-1 text-2xs text-muted-foreground">Must be disabled in production.</p></div>
          </div></CardContent>
        </Card>
      </div>
    </>
  );
}
