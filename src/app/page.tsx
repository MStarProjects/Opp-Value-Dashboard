import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { DashboardWorkbench } from "@/components/dashboard-workbench";
import { buildDashboardState } from "@/features/dashboard/buildDashboardState";
import { parseWorkbookData } from "@/features/workbook/parseWorkbook";
import { detectSourceRole } from "@/lib/data-sources";
import type { ParsedWorkbook } from "@/types/workbook";

async function loadDefaultPortfolioWorkbook(): Promise<{
  workbooks: ParsedWorkbook[];
  workbookBuffer?: Uint8Array;
}> {
  const dataDir = path.join(process.cwd(), "data", "raw");

  try {
    const fileNames = await readdir(dataDir);
    const excelFiles = fileNames.filter((fileName) => /\.xlsx?$/i.test(fileName));
    const portfolioFiles = excelFiles.filter(
      (fileName) => detectSourceRole(fileName) === "pmhub_portfolio",
    );

    const workbookFile = portfolioFiles[0] ?? excelFiles[0];
    if (!workbookFile) {
      return {
        workbooks: [],
        workbookBuffer: undefined,
      };
    }

    const filePath = path.join(dataDir, workbookFile);
    const fileBuffer = await readFile(filePath);

    return {
      workbooks: [parseWorkbookData(workbookFile, fileBuffer)],
      workbookBuffer: new Uint8Array(fileBuffer),
    };
  } catch {
    return {
      workbooks: [],
      workbookBuffer: undefined,
    };
  }
}

export default async function Home() {
  const initialInput = await loadDefaultPortfolioWorkbook();
  const initialState = await buildDashboardState(initialInput.workbooks, {
    preferStubEnrichment: true,
    retention: {
      workbookBuffer: initialInput.workbookBuffer,
      allowRetentionFallback: true,
    },
  });

  return <DashboardWorkbench initialState={initialState} />;
}
