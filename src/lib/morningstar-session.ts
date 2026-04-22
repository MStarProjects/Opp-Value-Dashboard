import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const sessionFilePath = path.join(process.cwd(), ".morningstar-session.json");

interface MorningstarSessionFile {
  token?: string;
  updatedAt?: string;
}

export function getMorningstarSessionFilePath() {
  return sessionFilePath;
}

export async function readMorningstarSessionToken() {
  try {
    const raw = await readFile(sessionFilePath, "utf8");
    const parsed = JSON.parse(raw) as MorningstarSessionFile;
    return parsed.token?.trim() ? parsed.token.trim() : undefined;
  } catch {
    return undefined;
  }
}

export async function writeMorningstarSessionToken(token: string) {
  const normalized = token.trim();

  if (!normalized) {
    throw new Error("Morningstar token cannot be empty.");
  }

  const payload: MorningstarSessionFile = {
    token: normalized,
    updatedAt: new Date().toISOString(),
  };

  await writeFile(sessionFilePath, JSON.stringify(payload, null, 2), "utf8");
}
