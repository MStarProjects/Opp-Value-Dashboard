import { DashboardWorkbench } from "@/components/dashboard-workbench";
import { buildDashboardState } from "@/features/dashboard/buildDashboardState";
import { loadActiveWorkbookInputs, findWorkbookInputByRole } from "@/lib/source-workbook-loader";

export default async function Home() {
  const initialInputs = await loadActiveWorkbookInputs();
  const initialState = await buildDashboardState(
    initialInputs.map((input) => input.workbook),
    {
    preferStubEnrichment: true,
    retention: {
        workbookBuffer: findWorkbookInputByRole(initialInputs, "pmhub_portfolio")?.buffer,
      allowRetentionFallback: true,
    },
    },
  );

  return <DashboardWorkbench initialState={initialState} />;
}
