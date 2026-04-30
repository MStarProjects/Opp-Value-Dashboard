import { spawn } from "node:child_process";
import path from "node:path";

import type { SleeveConfig } from "@/lib/sleeves";
import { readMorningstarSessionToken } from "@/lib/morningstar-session";
import type { CanonicalHolding } from "@/types/holdings";
import type { MorningstarEnrichmentResult } from "@/types/morningstar";

interface MorningstarBridgePayloadHolding {
  canonicalId: string;
  securityName: string;
  isin?: string;
  cusip?: string;
  sedol?: string;
  ticker?: string;
}

interface MorningstarBridgePayload {
  benchmarkInvestmentId: string;
  directDataSetIdOrName: string;
  includeBenchmarkHoldings: boolean;
  holdings: MorningstarBridgePayloadHolding[];
}

function buildBridgePayload(
  holdings: CanonicalHolding[],
  sleeveConfig: SleeveConfig,
): MorningstarBridgePayload {
  return {
    benchmarkInvestmentId: sleeveConfig.pmhubContract.benchmarkInvestmentId,
    directDataSetIdOrName: sleeveConfig.pmhubContract.directDataSetIdOrName,
    includeBenchmarkHoldings: true,
    holdings: holdings.map((holding) => ({
      canonicalId: holding.canonicalId,
      securityName: holding.securityName,
      isin: holding.isin,
      cusip: holding.cusip,
      sedol: holding.sedol,
      ticker: holding.ticker,
    })),
  };
}

export async function runMorningstarSdkEnrichment(
  holdings: CanonicalHolding[],
  sleeveConfig: SleeveConfig,
): Promise<MorningstarEnrichmentResult> {
  const pythonExecutable = process.env.MORNINGSTAR_PYTHON_PATH || "python";
  const scriptPath = path.join(process.cwd(), "scripts", "morningstar_sdk_bridge.py");
  const payload = JSON.stringify(buildBridgePayload(holdings, sleeveConfig));
  const savedToken = await readMorningstarSessionToken();
  const shouldEnableSdk = process.env.MORNINGSTAR_ENABLE_SDK === "true" || Boolean(savedToken);

  return new Promise((resolve, reject) => {
    const child = spawn(pythonExecutable, [scriptPath], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...(savedToken ? { MD_AUTH_TOKEN: savedToken } : {}),
        MORNINGSTAR_ENABLE_SDK: shouldEnableSdk ? "true" : process.env.MORNINGSTAR_ENABLE_SDK,
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
