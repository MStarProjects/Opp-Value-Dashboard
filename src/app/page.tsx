import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { DashboardWorkbench } from "@/components/dashboard-workbench";
import { parseWorkbookData } from "@/features/workbook/parseWorkbook";

async function loadDefaultWorkbooks() {
  const dataDir = path.join(process.cwd(), "data", "raw");

  try {
    const fileNames = await readdir(dataDir);
    const excelFiles = fileNames.filter((fileName) => /\.xlsx?$/i.test(fileName));

    return Promise.all(
      excelFiles.map(async (fileName) => {
        const filePath = path.join(dataDir, fileName);
        const fileBuffer = await readFile(filePath);
        return parseWorkbookData(fileName, fileBuffer);
      }),
    );
  } catch {
    return [];
  }
}

export default async function Home() {
  const initialWorkbooks = await loadDefaultWorkbooks();

  return <DashboardWorkbench initialWorkbooks={initialWorkbooks} />;
}
