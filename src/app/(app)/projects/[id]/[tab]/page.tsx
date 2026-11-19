import { notFound } from "next/navigation";
import { BriefTab } from "@/components/project/tab-brief";
import { InputsTab } from "@/components/project/tab-inputs";
import { PlanningTab } from "@/components/project/tab-planning";
import { AccommodationTab, AvTab, CreativeTab, LogisticsTab, ProductionTab } from "@/components/project/tab-departments";
import { BoqTab, BudgetTab, GanttTab, ManpowerTab, ProcurementTab, TimelineTab } from "@/components/project/tab-plan";
import { ActivityTab, ApprovalsTab, DocumentsTab, ExecutionTab, RisksTab } from "@/components/project/tab-control";

const TABS: Record<string, (p: { id: string; sp: Record<string, string | undefined> }) => Promise<React.ReactNode>> = {
  brief: BriefTab, inputs: InputsTab, planning: PlanningTab, production: ProductionTab, av: AvTab, logistics: LogisticsTab, accommodation: AccommodationTab, creative: CreativeTab,
  timeline: TimelineTab, gantt: GanttTab, boq: BoqTab, manpower: ManpowerTab, procurement: ProcurementTab, budget: BudgetTab, risks: RisksTab, execution: ExecutionTab, documents: DocumentsTab, approvals: ApprovalsTab, activity: ActivityTab,
};

export default async function ProjectTabPage({ params, searchParams }: { params: Promise<{ id: string; tab: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id, tab } = await params;
  const Tab = TABS[tab];
  if (!Tab) notFound();
  return <>{await Tab({ id, sp: await searchParams })}</>;
}
