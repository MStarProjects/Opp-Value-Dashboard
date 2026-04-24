import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { SourceRole } from "@/lib/data-sources";

type PersistableSourceRole = Extract<SourceRole, "pmhub_portfolio" | "algo_signal">;

const currentWorkbookRootPath = path.join(process.cwd(), "data", "current");
const currentWorkbookManifestPath = path.join(currentWorkbookRootPath, "manifest.json");

interface CurrentWorkbookEntry {
  role: PersistableSourceRole;
  originalFileName: string;
  storedFileName: string;
  updatedAt: string;
}

interface CurrentWorkbookManifest {
  workbooks: CurrentWorkbookEntry[];
}

export interface CurrentWorkbookBuffer {
  role: PersistableSourceRole;
  fileName: string;
  buffer: Uint8Array;
}

function sanitizeFileNameSegment(value: string) {
  return value
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function isPersistableSourceRole(role: SourceRole): role is PersistableSourceRole {
  return role === "pmhub_portfolio" || role === "algo_signal";
}

async function readManifest(): Promise<CurrentWorkbookManifest> {
  try {
    const raw = await readFile(currentWorkbookManifestPath, "utf8");
    const parsed = JSON.parse(raw) as CurrentWorkbookManifest;
    return {
      workbooks: Array.isArray(parsed.workbooks) ? parsed.workbooks : [],
    };
  } catch {
    return {
      workbooks: [],
    };
  }
}

async function writeManifest(manifest: CurrentWorkbookManifest) {
  await mkdir(currentWorkbookRootPath, { recursive: true });
  await writeFile(currentWorkbookManifestPath, JSON.stringify(manifest, null, 2), "utf8");
}

export async function persistCurrentWorkbook(input: {
  role: SourceRole;
  fileName: string;
  buffer: Uint8Array;
}) {
  if (!isPersistableSourceRole(input.role)) {
    return;
  }

  await mkdir(currentWorkbookRootPath, { recursive: true });

  const extension = path.extname(input.fileName) || ".xlsx";
  const storedFileName = `${input.role}__${sanitizeFileNameSegment(input.fileName) || "latest"}${extension}`;
  const entry: CurrentWorkbookEntry = {
    role: input.role,
    originalFileName: input.fileName,
    storedFileName,
    updatedAt: new Date().toISOString(),
  };

  await writeFile(path.join(currentWorkbookRootPath, storedFileName), Buffer.from(input.buffer));

  const manifest = await readManifest();
  manifest.workbooks = [
    entry,
    ...manifest.workbooks.filter((workbook) => workbook.role !== input.role),
  ];
  await writeManifest(manifest);
}

export async function loadCurrentWorkbooks(): Promise<CurrentWorkbookBuffer[]> {
  const manifest = await readManifest();
  const buffers = await Promise.all(
    manifest.workbooks.map(async (entry) => {
      try {
        const buffer = await readFile(path.join(currentWorkbookRootPath, entry.storedFileName));
        return {
          role: entry.role,
          fileName: entry.originalFileName,
          buffer: new Uint8Array(buffer),
        } satisfies CurrentWorkbookBuffer;
      } catch {
        return undefined;
      }
    }),
  );

  return buffers.reduce<CurrentWorkbookBuffer[]>((collected, buffer) => {
    if (buffer) {
      collected.push(buffer);
    }

    return collected;
  }, []);
}
