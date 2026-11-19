import { OverviewTab } from "@/components/project/tab-overview";
export default async function ProjectOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OverviewTab id={id} />;
}
