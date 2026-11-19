import { BarChart3, Bell, BedDouble, Boxes, Briefcase, CalendarRange, CheckCheck, ClipboardList, FileStack, FolderKanban, Hammer, HardHat, Library, LayoutDashboard, MonitorSpeaker, Palette, Settings, ShieldAlert, ShoppingCart, Sparkles, Truck, Users, Wallet, Activity } from "lucide-react";
import type { NavIcon } from "@/config/nav";

export const NAV_ICONS: Record<NavIcon, typeof Bell> = {
  dashboard: LayoutDashboard, projects: FolderKanban, tasks: ClipboardList, approvals: CheckCheck, bell: Bell, ai: Sparkles, planning: CalendarRange,
  production: Hammer, av: MonitorSpeaker, logistics: Truck, accommodation: BedDouble, creative: Palette, procurement: ShoppingCart, account: Briefcase,
  execution: Activity, risk: ShieldAlert, budget: Wallet, resources: Boxes, manpower: HardHat, documents: FileStack, reports: BarChart3, knowledge: Library, settings: Settings, users: Users,
};
