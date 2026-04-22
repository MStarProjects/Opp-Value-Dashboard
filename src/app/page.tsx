import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { DashboardWorkbench } from "@/components/dashboard-workbench";
import { buildDashboardState } from "@/features/dashboard/buildDashboardState";
import { parseWorkbookData } from "@/features/workbook/parseWorkbook";
import { detectSourceRole } from "@/lib/data-sources";

async function loadDefaultPortfolioWorkbook() {
  const dataDir = path.join(process.cwd(), "data", "raw");

  try {
    const fileNames = await readdir(dataDir);
    const excelFiles = fileNames.filter((fileName) => /\.xlsx?$/i.test(fileName));
    const portfolioFiles = excelFiles.filter(
      (fileName) => detectSourceRole(fileName) === "pmhub_portfolio",
    );

    const workbookFile = portfolioFiles[0] ?? excelFiles[0];
    if (!workbookFile) {
      return [];
    }

    const filePath = path.join(dataDir, workbookFile);
    const fileBuffer = await readFile(filePath);

    return [parseWorkbookData(workbookFile, fileBuffer)];
  } catch {
    return [];
  }
}

export default async function Home() {
  const initialWorkbooks = await loadDefaultPortfolioWorkbook();
  const initialState = await buildDashboardState(initialWorkbooks, {
    preferStubEnrichment: true,
  });

  return <DashboardWorkbench initialState={initialState} />;
}
