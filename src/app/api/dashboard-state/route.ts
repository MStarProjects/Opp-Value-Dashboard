import { NextResponse } from "next/server";

import { buildDashboardState } from "@/features/dashboard/buildDashboardState";
import { parseWorkbookData } from "@/features/workbook/parseWorkbook";
import { persistCurrentWorkbook } from "@/lib/current-workbook-store";
import {
  findWorkbookInputByRole,
  loadActiveWorkbookInputs,
  mergeUploadedWorkbookInput,
} from "@/lib/source-workbook-loader";

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

    const activeInputs = await loadActiveWorkbookInputs();
    let nextInputs = activeInputs;

    if (uploadedFile) {
      const uploadedBuffer = new Uint8Array(await uploadedFile.arrayBuffer());
      const uploadedWorkbook = parseWorkbookData(uploadedFile.name, uploadedBuffer);

      if (
        uploadedWorkbook.sourceRole === "unknown" ||
        uploadedWorkbook.sourceRole === "presentation_example"
      ) {
        return NextResponse.json(
          {
            error:
              "That workbook was not recognized as either the PMHub portfolio file or the Equity Algo file.",
          },
          { status: 400 },
        );
      }

      await persistCurrentWorkbook({
        role: uploadedWorkbook.sourceRole,
        fileName: uploadedFile.name,
        buffer: uploadedBuffer,
      });

      nextInputs = mergeUploadedWorkbookInput(activeInputs, {
        fileName: uploadedFile.name,
        buffer: uploadedBuffer,
        workbook: uploadedWorkbook,
        origin: "upload",
      });
    }

    const pmhubInput = findWorkbookInputByRole(nextInputs, "pmhub_portfolio");

    if (!pmhubInput) {
      return NextResponse.json(
        { error: "No PMHub workbook was available to build the dashboard." },
        { status: 400 },
      );
    }

    const dashboardState = await buildDashboardState(
      nextInputs.map((input) => input.workbook),
      {
      retention: {
          workbookBuffer: pmhubInput.buffer,
        allowRetentionFallback: true,
        persistSnapshots:
          snapshotReason === "manual_upload" || snapshotReason === "token_refresh",
        snapshotReason,
      },
      },
    );

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
