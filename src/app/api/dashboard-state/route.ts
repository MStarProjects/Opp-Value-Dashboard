import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { buildDashboardState } from "@/features/dashboard/buildDashboardState";
import { parseWorkbookData } from "@/features/workbook/parseWorkbook";
import { detectSourceRole } from "@/lib/data-sources";

async function loadDefaultPortfolioWorkbookBuffer() {
  const dataDir = path.join(process.cwd(), "data", "raw");
  const fileNames = await readdir(dataDir);
  const excelFiles = fileNames.filter((fileName) => /\.xlsx?$/i.test(fileName));
  const portfolioFiles = excelFiles.filter(
    (fileName) => detectSourceRole(fileName) === "pmhub_portfolio",
  );
  const workbookFile = portfolioFiles[0] ?? excelFiles[0];

  if (!workbookFile) {
    return undefined;
  }

  return {
    fileName: workbookFile,
    buffer: await readFile(path.join(dataDir, workbookFile)),
  };
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const snapshotReason = url.searchParams.get("reason") ?? "dashboard_refresh";
    const contentType = request.headers.get("content-type") ?? "";
    let uploadedFile: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const candidate = formData.get("file");
      uploadedFile = candidate instanceof File ? candidate : null;
    }

    const workbookInput =
      uploadedFile
        ? {
            fileName: uploadedFile.name,
            buffer: new Uint8Array(await uploadedFile.arrayBuffer()),
          }
        : await loadDefaultPortfolioWorkbookBuffer();

    if (!workbookInput) {
      return NextResponse.json(
        { error: "No PMHub workbook was available to build the dashboard." },
        { status: 400 },
      );
    }

    const workbook = parseWorkbookData(workbookInput.fileName, workbookInput.buffer);
    const dashboardState = await buildDashboardState([workbook], {
      retention: {
        workbookBuffer: workbookInput.buffer,
        allowRetentionFallback: true,
        persistSnapshots:
          snapshotReason === "manual_upload" || snapshotReason === "token_refresh",
        snapshotReason,
      },
    });

    return NextResponse.json(dashboardState);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to build dashboard state.",
      },
      { status: 500 },
    );
  }
}
