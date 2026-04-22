import { NextResponse } from "next/server";

import {
  readMorningstarSessionToken,
  writeMorningstarSessionToken,
} from "@/lib/morningstar-session";

export async function GET() {
  const token = await readMorningstarSessionToken();
  return NextResponse.json({ configured: Boolean(token) });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { token?: string };
    const token = body.token?.trim();

    if (!token) {
      return NextResponse.json(
        { error: "A Morningstar token is required." },
        { status: 400 },
      );
    }

    await writeMorningstarSessionToken(token);
    return NextResponse.json({ configured: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to save Morningstar token.",
      },
      { status: 500 },
    );
  }
}
