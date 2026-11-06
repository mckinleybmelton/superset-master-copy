import { NextRequest, NextResponse } from "next/server";
import { requireIdentity } from "../../../../../cursor/identity";
import { DEFAULT_LOOKBACK_DAYS } from "@/lib/config";
import { syncAll } from "@/lib/sync";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const identity = await requireIdentity(request);
  if (identity instanceof Response) return identity;

  let lookbackDays = DEFAULT_LOOKBACK_DAYS;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      lookbackDays?: number;
    };
    if (typeof body.lookbackDays === "number" && body.lookbackDays > 0) {
      lookbackDays = Math.min(body.lookbackDays, 365);
    }
  } catch {
    // empty body is fine
  }

  try {
    const result = await syncAll(lookbackDays);
    return NextResponse.json(result, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
