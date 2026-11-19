"use client";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Bell, ChevronDown, FolderKanban, Globe, Hammer, LogOut, Menu, Plus, Search, Sparkles, UserRound, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/kit";
import { useI18n } from "@/i18n/client";
import { logoutAction, setLocaleAction } from "@/server/actions/auth";
import { markAllReadAction } from "@/server/actions/notifications";
import type { NavSection } from "@/config/nav";
import { SidebarNav } from "./sidebar";
import { ProductLockup } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

export interface HeaderProps {
  user: { name: string; roleName: string; department: string | null; email: string; jobTitle: string | null };
  projects: { id: string; code: string; name: string; status: string }[];
  notifications: { id: string; title: string; link: string | null; createdAt: string; read: boolean; type: string }[];
  unread: number;
  sections: NavSection[];
  can: { createProject: boolean; addProduction: boolean; ai: boolean };
}

export function Header({ user, projects, notifications, unread, sections, can }: HeaderProps) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const path = usePathname();
  const sp = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pending, start] = useTransition();
  const currentId = (path.startsWith("/projects/") ? params.id : undefined) ?? sp.get("project") ?? undefined;
  const current = projects.find((p) => p.id === currentId);

  const switchProject = (id: string | null) => {
    if (path.startsWith("/projects/") && id) router.push(path.replace(/\/projects\/[^/]+/, `/projects/${id}`));
    else {
      const q = new URLSearchParams(sp.toString());
      if (id) q.set("project", id); else q.delete("project");
      router.push(`${path}${q.toString() ? `?${q}` : ""}`);
    }
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-card/95 px-3 backdrop-blur sm:gap-3 sm:px-5">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu /></Button>
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent side="left" className="flex flex-col border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <div className="flex h-16 items-center border-b border-sidebar-border px-5"><ProductLockup /></div>
          <SidebarNav sections={sections} onNavigate={() => setMobileOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* project context */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex min-w-0 max-w-[46vw] items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-start hover:bg-muted sm:max-w-xs" aria-label={t.header.project}>
            <FolderKanban className="size-4 shrink-0 text-primary" />
            <span className="min-w-0">
              <span className="hidden text-[10px] uppercase tracking-wider text-muted-foreground sm:block">{t.header.project}</span>
              <span className="block truncate text-xs font-semibold">{current ? current.name : t.header.allProjects}</span>
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel>{t.header.project}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => switchProject(null)}>{t.header.allProjects}</DropdownMenuItem>
          <DropdownMenuSeparator />
          {projects.map((p) => (
            <DropdownMenuItem key={p.id} onSelect={() => switchProject(p.id)} className={cn(p.id === currentId && "bg-accent")}>
              <div className="min-w-0"><div className="truncate font-medium">{p.name}</div><div className="text-2xs text-muted-foreground">{p.code} · {p.status.replace(/_/g, " ").toLowerCase()}</div></div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <form action="/search" className="relative ms-1 hidden flex-1 md:block md:max-w-md">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input name="q" placeholder={t.header.search} className="h-9 w-full rounded-md border border-input bg-muted/50 ps-9 pe-3 text-sm placeholder:text-muted-foreground/70 focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/20" />
      </form>

      <div className="ms-auto flex items-center gap-1 sm:gap-1.5">
        <Button variant="ghost" size="icon" className="md:hidden" asChild aria-label={t.common.search}><Link href="/search"><Search /></Link></Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="sm" className="hidden sm:inline-flex"><Zap />{t.header.quickActions}</Button></DropdownMenuTrigger>
          <DropdownMenuContent>
            {can.createProject && <DropdownMenuItem onSelect={() => router.push("/projects/new")}><Plus />{t.header.newProject}</DropdownMenuItem>}
            {can.addProduction && <DropdownMenuItem onSelect={() => router.push(`/production/new${current ? `?project=${current.id}` : ""}`)}><Hammer />{t.header.addProduction}</DropdownMenuItem>}
            {can.ai && <DropdownMenuItem onSelect={() => router.push(`/assistant${current ? `?project=${current.id}` : ""}`)}><Sparkles />{t.header.askAi}</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => { await setLocaleAction(locale === "en" ? "ar" : "en"); router.refresh(); })} aria-label={t.header.language} className="px-2">
          <Globe /><span className="text-xs font-semibold">{locale === "en" ? "عربي" : "EN"}</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label={t.nav.notifications}>
              <Bell />
              {unread > 0 && <span className="absolute end-1 top-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-80">
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-xs font-semibold">{t.nav.notifications}</span>
              {unread > 0 && <button className="text-2xs text-primary hover:underline" onClick={() => start(async () => { await markAllReadAction(); router.refresh(); })}>Mark all read</button>}
            </div>
            <DropdownMenuSeparator />
            {notifications.length === 0 && <div className="px-2 py-6 text-center text-xs text-muted-foreground">{t.common.noData}</div>}
            {notifications.map((n) => (
              <DropdownMenuItem key={n.id} onSelect={() => n.link && router.push(n.link)} className="items-start">
                <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-brand-cyan")} />
                <div className="min-w-0"><div className={cn("line-clamp-2 text-xs", !n.read && "font-semibold")}>{n.title}</div><div className="text-2xs text-muted-foreground">{new Date(n.createdAt).toLocaleString(locale === "ar" ? "ar-EG" : "en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div></div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push("/notifications")} className="justify-center text-xs text-primary">{t.common.viewAll}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-md p-1 hover:bg-muted sm:pe-2" aria-label={t.header.profile}>
              <Avatar name={user.name} />
              <span className="hidden min-w-0 text-start leading-tight xl:block"><span className="block max-w-[150px] truncate text-xs font-semibold">{user.name}</span><span className="block max-w-[150px] truncate text-2xs text-muted-foreground">{user.roleName}{user.department ? ` · ${user.department}` : ""}</span></span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64">
            <div className="px-2 py-2"><div className="text-sm font-semibold">{user.name}</div><div className="text-2xs text-muted-foreground">{user.email}</div><div className="mt-1 text-2xs"><span className="font-medium">{user.roleName}</span>{user.department && <> · {t.header.department}: {user.department}</>}</div></div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push("/settings")}><UserRound />{t.header.profile}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => start(() => logoutAction())}><LogOut className="rtl:-scale-x-100" />{t.header.signOut}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
