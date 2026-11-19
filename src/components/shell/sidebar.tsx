"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavSection } from "@/config/nav";
import { NAV_ICONS } from "./icons";
import { ProductLockup } from "@/components/brand/logo";
import { BRAND } from "@/config/brand";

export function SidebarNav({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Main">
      {sections.map((s) => (
        <div key={s.key}>
          <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-muted">{s.label}</div>
          <ul className="space-y-0.5">
            {s.items.map((i) => {
              const Icon = NAV_ICONS[i.icon];
              const active = path === i.href || (i.href !== "/dashboard" && path.startsWith(i.href + "/")) || (i.href === "/projects" && path.startsWith("/projects"));
              return (
                <li key={i.key}>
                  <Link href={i.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
                    className={cn("group relative flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
                      active ? "bg-sidebar-active text-white" : "text-sidebar-foreground/75 hover:bg-sidebar-active/60 hover:text-white")}>
                    {active && <span className="absolute inset-y-1.5 start-0 w-[3px] rounded-full bg-brand-cyan" />}
                    <Icon className={cn("size-[17px] shrink-0", active ? "text-brand-cyan" : "text-sidebar-muted group-hover:text-brand-cyan-pale")} />
                    <span className="truncate">{i.label}</span>
                    {i.badge ? <span className="ms-auto rounded-full bg-brand-cyan/20 px-1.5 text-[10px] font-semibold text-brand-cyan-light">{i.badge}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({ sections, company }: { sections: NavSection[]; company: string }) {
  return (
    <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 flex-col border-e border-sidebar-border bg-sidebar lg:flex">
      <Link href="/dashboard" className="flex h-16 items-center border-b border-sidebar-border px-5"><ProductLockup /></Link>
      <SidebarNav sections={sections} />
      <div className="border-t border-sidebar-border px-5 py-3 text-[10px] leading-relaxed text-sidebar-muted">
        <div className="font-semibold text-sidebar-foreground/80">{company}</div>
        <div>{BRAND.tagline}</div>
      </div>
    </aside>
  );
}
