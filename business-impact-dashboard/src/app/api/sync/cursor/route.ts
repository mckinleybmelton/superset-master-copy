import { NextRequest, NextResponse } from "next/server";
import { requireIdentity } from "../../../../../cursor/identity";
import { DEFAULT_LOOKBACK_DAYS, getConfigStatus } from "@/lib/config";
import { syncCursor } from "@/lib/sync";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const identity = await requireIdentity(request);
  if (identity instanceof Response) return identity;

  const config = getConfigStatus();
  if (!config.usageConfigured) {
    return NextResponse.json(
      {
        error: "USAGE_ADMIN_API_KEY is not configured",
        missingSecrets: config.missingSecrets,
      },
      { status: 400 },
    );
  }

  try {
    const result = await syncCursor(DEFAULT_LOOKBACK_DAYS);
    return NextResponse.json(result, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
