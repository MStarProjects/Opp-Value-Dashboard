import { spawn } from "node:child_process";
import path from "node:path";

import { pmhubWorkbookContract } from "@/lib/pmhub-workbook-contract";
import type { CanonicalHolding } from "@/types/holdings";
import type { MorningstarEnrichmentResult } from "@/types/morningstar";

interface MorningstarBridgePayloadHolding {
  canonicalId: string;
  securityName: string;
  isin?: string;
  ticker?: string;
}

interface MorningstarBridgePayload {
  benchmarkInvestmentId: string;
  directDataSetIdOrName: string;
  holdings: MorningstarBridgePayloadHolding[];
}

function buildBridgePayload(holdings: CanonicalHolding[]): MorningstarBridgePayload {
  return {
    benchmarkInvestmentId: pmhubWorkbookContract.benchmarkInvestmentId,
    directDataSetIdOrName: pmhubWorkbookContract.directDataSetIdOrName,
    holdings: holdings.map((holding) => ({
      canonicalId: holding.canonicalId,
      securityName: holding.securityName,
      isin: holding.isin,
      ticker: holding.ticker,
    })),
  };
}

export async function runMorningstarSdkEnrichment(
  holdings: CanonicalHolding[],
): Promise<MorningstarEnrichmentResult> {
  const pythonExecutable = process.env.MORNINGSTAR_PYTHON_PATH || "python";
  const scriptPath = path.join(process.cwd(), "scripts", "morningstar_sdk_bridge.py");
  const payload = JSON.stringify(buildBridgePayload(holdings));

  return new Promise((resolve, reject) => {
    const child = spawn(pythonExecutable, [scriptPath], {
      cwd: process.cwd(),
      env: {
        ...process.env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Morningstar SDK bridge exited with code ${code}.`));
        return;
      }

      try {
        resolve(JSON.parse(stdout) as MorningstarEnrichmentResult);
      } catch (error) {
        reject(
          new Error(
            error instanceof Error
              ? `Unable to parse Morningstar SDK bridge output: ${error.message}`
              : "Unable to parse Morningstar SDK bridge output.",
          ),
        );
      }
    });

    child.stdin.write(payload);
    child.stdin.end();
  });
}
