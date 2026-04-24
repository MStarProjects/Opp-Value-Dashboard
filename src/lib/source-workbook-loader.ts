import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { parseWorkbookData } from "@/features/workbook/parseWorkbook";
import { pickLatestWorkbooksByRole, type SourceRole } from "@/lib/data-sources";
import { loadCurrentWorkbooks } from "@/lib/current-workbook-store";
import type { ParsedWorkbook } from "@/types/workbook";

export interface LoadedWorkbookInput {
  fileName: string;
  buffer: Uint8Array;
  workbook: ParsedWorkbook;
  origin: "raw" | "current" | "upload";
}

async function loadRawWorkbookInputs(): Promise<LoadedWorkbookInput[]> {
  const dataDir = path.join(process.cwd(), "data", "raw");

  try {
    const fileNames = await readdir(dataDir);
    const excelFiles = fileNames.filter((fileName) => /\.xlsx?$/i.test(fileName));
    const buffers = await Promise.all(
      excelFiles.map(async (fileName) => {
        const buffer = new Uint8Array(await readFile(path.join(dataDir, fileName)));
        return {
          fileName,
          buffer,
          workbook: parseWorkbookData(fileName, buffer),
          origin: "raw" as const,
        };
      }),
    );

    return buffers;
  } catch {
    return [];
  }
}

function selectLatestInputs(inputs: LoadedWorkbookInput[]) {
  const workbookByFileName = new Map(inputs.map((input) => [input.fileName, input]));
  const selectedWorkbooks = pickLatestWorkbooksByRole(inputs.map((input) => input.workbook));

  return selectedWorkbooks
    .map((workbook) => workbookByFileName.get(workbook.fileName))
    .filter((input): input is LoadedWorkbookInput => Boolean(input));
}

export async function loadActiveWorkbookInputs() {
  const [currentInputs, rawInputs] = await Promise.all([
    loadCurrentWorkbooks(),
    loadRawWorkbookInputs(),
  ]);

  const parsedCurrentInputs: LoadedWorkbookInput[] = currentInputs.map((input) => ({
    ...input,
    workbook: parseWorkbookData(input.fileName, input.buffer),
    origin: "current",
  }));

  const currentRoles = new Set(parsedCurrentInputs.map((input) => input.workbook.sourceRole));
  const combinedInputs = [
    ...parsedCurrentInputs,
    ...rawInputs.filter((input) => !currentRoles.has(input.workbook.sourceRole)),
  ];

  return selectLatestInputs(combinedInputs);
}

export function mergeUploadedWorkbookInput(
  activeInputs: LoadedWorkbookInput[],
  uploadedInput: LoadedWorkbookInput,
) {
  const uploadedRole = uploadedInput.workbook.sourceRole;
  const remainingInputs =
    uploadedRole === "unknown" || uploadedRole === "presentation_example"
      ? activeInputs.filter((input) => input.fileName !== uploadedInput.fileName)
      : activeInputs.filter((input) => input.workbook.sourceRole !== uploadedRole);

  return selectLatestInputs([...remainingInputs, uploadedInput]);
}

export function findWorkbookInputByRole(
  inputs: LoadedWorkbookInput[],
  role: SourceRole,
) {
  return inputs.find((input) => input.workbook.sourceRole === role);
}
