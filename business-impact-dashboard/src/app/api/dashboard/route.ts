import { NextRequest, NextResponse } from "next/server";
import { requireIdentity } from "../../../../cursor/identity";
import { DEFAULT_LOOKBACK_DAYS } from "@/lib/config";
import { buildDashboard } from "@/lib/metrics";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const identity = await requireIdentity(request);
  if (identity instanceof Response) return identity;

  const url = new URL(request.url);
  const days = Number(url.searchParams.get("days") ?? DEFAULT_LOOKBACK_DAYS);
  const lookback = Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 90;
  const projectKey = url.searchParams.get("project");
  const includeInFlight = url.searchParams.get("inFlight") !== "0";

  const rangeEnd = new Date();
  const rangeStart = new Date(
    rangeEnd.getTime() - lookback * 24 * 60 * 60 * 1000,
  );

  try {
    const data = await buildDashboard({
      rangeStart,
      rangeEnd,
      projectKey,
      includeInFlight,
    });
    return NextResponse.json(data, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
