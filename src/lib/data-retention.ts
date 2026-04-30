import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { DashboardState } from "@/types/dashboard";
import type { MorningstarEnrichmentResult } from "@/types/morningstar";
import type { ParsedWorkbook } from "@/types/workbook";
import type { SleeveId } from "@/lib/sleeves";

const retentionRootPath = path.join(process.cwd(), "data", "retention");
const retentionManifestPath = path.join(retentionRootPath, "manifest.json");

export interface RetentionManifestEntry {
  snapshotId: string;
  sleeveId: SleeveId;
  createdAt: string;
  snapshotDate: string;
  snapshotReason: string;
  pmhubFileName: string;
  pmhubWorkbookHash: string;
  workbookDateToken?: string;
  enrichmentStatus: "stubbed" | "configured";
  benchmarkDate?: string;
  weightedHoldingCount: number;
  benchmarkConstituentCount: number;
  relativeDirectory: string;
}

interface RetentionManifestFile {
  snapshots: RetentionManifestEntry[];
}

export interface PersistRetentionSnapshotInput {
  parsedWorkbook: ParsedWorkbook;
  workbookBuffer: Uint8Array;
  dashboardState: DashboardState;
  enrichment: MorningstarEnrichmentResult;
  snapshotReason: string;
}

export interface RetainedDashboardSnapshot {
  entry: RetentionManifestEntry;
  dashboardState: DashboardState;
}

function sanitizeSegment(value: string) {
  return value
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function snapshotDirectoryName(createdAt: string, fileName: string) {
  return `${createdAt.replace(/[:.]/g, "-")}__${sanitizeSegment(fileName) || "pmhub"}`;
}

async function readRetentionManifest(): Promise<RetentionManifestFile> {
  try {
    const raw = await readFile(retentionManifestPath, "utf8");
    const parsed = JSON.parse(raw) as RetentionManifestFile;
    return {
      snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
    };
  } catch {
    return { snapshots: [] };
  }
}

async function writeRetentionManifest(manifest: RetentionManifestFile) {
  await mkdir(retentionRootPath, { recursive: true });
  await writeFile(retentionManifestPath, JSON.stringify(manifest, null, 2), "utf8");
}

export function getDataRetentionRootPath() {
  return retentionRootPath;
}

export function computeWorkbookHash(workbookBuffer: Uint8Array) {
  return createHash("sha256").update(workbookBuffer).digest("hex");
}

function withRetentionNote(dashboardState: DashboardState, note: string): DashboardState {
  return {
    ...dashboardState,
    enrichmentAudit: {
      ...dashboardState.enrichmentAudit,
      notes: [...dashboardState.enrichmentAudit.notes, note],
    },
  };
}

export function appendRetentionNote(dashboardState: DashboardState, note: string) {
  return withRetentionNote(dashboardState, note);
}

export async function loadLatestConfiguredSnapshot(
  workbookHash: string,
): Promise<RetainedDashboardSnapshot | undefined> {
  const manifest = await readRetentionManifest();
  const match = manifest.snapshots.find(
    (entry) =>
      entry.pmhubWorkbookHash === workbookHash &&
      entry.enrichmentStatus === "configured",
  );

  if (!match) {
    return undefined;
  }

  const dashboardPath = path.join(
    retentionRootPath,
    match.relativeDirectory,
    "dashboard-state.json",
  );

  try {
    const raw = await readFile(dashboardPath, "utf8");
    return {
      entry: match,
      dashboardState: JSON.parse(raw) as DashboardState,
    };
  } catch {
    return undefined;
  }
}

export async function persistRetentionSnapshot(
  input: PersistRetentionSnapshotInput,
): Promise<RetentionManifestEntry> {
  const createdAt = new Date().toISOString();
  const snapshotDate = createdAt.slice(0, 10);
  const workbookHash = computeWorkbookHash(input.workbookBuffer);
  const directoryName = snapshotDirectoryName(createdAt, input.parsedWorkbook.fileName);
  const relativeDirectory = path.join(snapshotDate, directoryName);
  const snapshotDirectory = path.join(retentionRootPath, relativeDirectory);
  const workbookArchiveName = path.basename(input.parsedWorkbook.fileName);

  await mkdir(snapshotDirectory, { recursive: true });

  const entry: RetentionManifestEntry = {
    snapshotId: directoryName,
    sleeveId: input.dashboardState.sleeveId,
    createdAt,
    snapshotDate,
    snapshotReason: input.snapshotReason,
    pmhubFileName: input.parsedWorkbook.fileName,
    pmhubWorkbookHash: workbookHash,
    workbookDateToken: input.parsedWorkbook.dateToken,
    enrichmentStatus: input.enrichment.audit.status,
    benchmarkDate: input.enrichment.benchmarkHoldings?.latestDate,
    weightedHoldingCount: input.dashboardState.audit.weightedHoldingRows,
    benchmarkConstituentCount:
      input.dashboardState.enrichmentAudit.benchmarkConstituentCount,
    relativeDirectory,
  };

  await Promise.all([
    writeFile(
      path.join(snapshotDirectory, workbookArchiveName),
      Buffer.from(input.workbookBuffer),
    ),
    writeFile(
      path.join(snapshotDirectory, "pmhub-values.json"),
      JSON.stringify(
        {
          fileName: input.parsedWorkbook.fileName,
          sourceRole: input.parsedWorkbook.sourceRole,
          dateToken: input.parsedWorkbook.dateToken,
          sheets: input.parsedWorkbook.sheets,
        },
        null,
        2,
      ),
      "utf8",
    ),
    writeFile(
      path.join(snapshotDirectory, "morningstar-values.json"),
      JSON.stringify(input.enrichment, null, 2),
      "utf8",
    ),
    writeFile(
      path.join(snapshotDirectory, "dashboard-state.json"),
      JSON.stringify(input.dashboardState, null, 2),
      "utf8",
    ),
    writeFile(
      path.join(snapshotDirectory, "snapshot-meta.json"),
      JSON.stringify(entry, null, 2),
      "utf8",
    ),
  ]);

  const manifest = await readRetentionManifest();
  manifest.snapshots = [
    entry,
    ...manifest.snapshots.filter(
      (snapshot) => snapshot.snapshotId !== entry.snapshotId,
    ),
  ];
  await writeRetentionManifest(manifest);

  return entry;
}

export function describeRetainedSnapshot(
  dashboardState: DashboardState,
  entry: RetentionManifestEntry,
  message: string,
) {
  return withRetentionNote(
    dashboardState,
    `${message} Retained snapshot: ${entry.createdAt}.`,
  );
}
