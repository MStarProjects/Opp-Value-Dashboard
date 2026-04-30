import { DashboardWorkbench } from "@/components/dashboard-workbench";
import { buildDashboardState } from "@/features/dashboard/buildDashboardState";

export default async function Home() {
  const initialState = await buildDashboardState([], {
    sleeveId: "global_xus",
    preferStubEnrichment: true,
  });

  return <DashboardWorkbench initialState={initialState} />;
}
