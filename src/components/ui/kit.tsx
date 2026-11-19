import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Info, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "./badge";
import { STATUS_LABELS } from "@/i18n/dictionaries";

export function PageHeader({ title, description, eyebrow, actions, children, className }: { title: React.ReactNode; description?: React.ReactNode; eyebrow?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-5 flex flex-col gap-3 sm:mb-6 lg:flex-row lg:items-end lg:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-2xs font-semibold uppercase tracking-[0.14em] text-primary">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, sub, icon: Icon, tone = "default", href, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: LucideIcon; tone?: "default" | "success" | "warning" | "danger" | "info"; href?: string; className?: string }) {
  const toneCls = { default: "bg-accent text-primary", success: "bg-success-soft text-success", warning: "bg-warning-soft text-warning", danger: "bg-danger-soft text-danger", info: "bg-info-soft text-info" }[tone];
  const body = (
    <div className={cn("group relative h-full rounded-lg border bg-card p-4 shadow-card transition-colors", href && "hover:border-primary/40", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        {Icon && <div className={cn("grid size-8 shrink-0 place-items-center rounded-md", toneCls)}><Icon className="size-4" /></div>}
      </div>
      <div className="mt-1.5 font-display text-2xl font-semibold tabular text-foreground">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      {href && <ArrowUpRight className="absolute bottom-3 end-3 size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 rtl:-scale-x-100" />}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

const TONE: Record<string, "success" | "warning" | "danger" | "info" | "violet" | "secondary" | "default" | "navy"> = {
  APPROVED: "success", VERIFIED: "success", COMPLETED: "success", CONFIRMED: "success", DELIVERED: "success", MITIGATED: "success", CLOSED: "secondary", APPLIED: "success",
  CALCULATED: "info", SUBMITTED: "info", IN_PROGRESS: "info", IN_EXECUTION: "info", ORDERED: "info", QUOTED: "info", RFQ_PREPARED: "info", MONITORING: "info", PLANNING: "info",
  ESTIMATED: "warning", PENDING: "warning", UNDER_REVIEW: "violet", PENDING_APPROVAL: "violet", AWAITING_INPUTS: "warning", REQUESTED: "warning", DELAYED: "warning", PARTIALLY_DELIVERED: "warning", IN_PREPARATION: "info", PROPOSED: "violet", REVISED: "violet", CHANGES_REQUESTED: "warning",
  NEEDS_INFORMATION: "danger", REJECTED: "danger", BLOCKED: "danger", CANCELLED: "secondary", TRIGGERED: "danger", MISSING: "danger", PROVIDED: "info",
  DRAFT: "secondary", NOT_STARTED: "secondary", LEAD: "secondary", IDENTIFIED: "secondary", EXTRACTING: "info", SUPERSEDED: "secondary", DEMO: "warning",
  LOW: "secondary", MEDIUM: "info", HIGH: "warning", CRITICAL: "danger",
};

export function StatusBadge({ status, locale = "en", className }: { status: string; locale?: "en" | "ar"; className?: string }) {
  const label = STATUS_LABELS[status]?.[locale] ?? status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  return <Badge variant={TONE[status] ?? "secondary"} className={className}>{label}</Badge>;
}

export function EmptyState({ icon: Icon = Info, title, description, action, className }: { icon?: LucideIcon; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed bg-card/50 px-6 py-10 text-center", className)}>
      <div className="mb-3 grid size-10 place-items-center rounded-full bg-accent text-primary"><Icon className="size-5" /></div>
      <div className="font-display text-sm font-semibold">{title}</div>
      {description && <p className="mt-1 max-w-md text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function TableWrap({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("scrollbar-thin max-w-full overflow-x-auto", className)}>{children}</div>;
}

export function DemoBanner({ text = "DEMO DATA — NOT APPROVED PARADIGM COMPANY DATA" }: { text?: string }) {
  return <div className="no-print flex items-center gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-1.5 text-2xs font-semibold uppercase tracking-wider text-warning"><Info className="size-3.5 shrink-0" />{text}</div>;
}

export function KeyValue({ items, className, cols = 2 }: { items: [React.ReactNode, React.ReactNode][]; className?: string; cols?: 1 | 2 | 3 | 4 }) {
  const c = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[cols];
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-3", c, className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">{k}</dt>
          <dd className="mt-0.5 break-words text-sm text-foreground">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name.replace(/^Demo\s+/i, "").split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  return <span className={cn("inline-grid size-8 shrink-0 place-items-center rounded-full bg-brand-navy-light text-2xs font-semibold text-brand-cyan-pale ring-1 ring-brand-cyan/30", className)}>{initials}</span>;
}

export function SeverityDot({ level }: { level: "error" | "warning" | "info" }) {
  return <span className={cn("mt-1.5 inline-block size-2 shrink-0 rounded-full", level === "error" ? "bg-danger" : level === "warning" ? "bg-warning" : "bg-info")} />;
}
