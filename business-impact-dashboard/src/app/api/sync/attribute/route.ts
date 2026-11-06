import { NextRequest, NextResponse } from "next/server";
import { requireIdentity } from "../../../../../cursor/identity";
import { syncAttribute } from "@/lib/sync";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const identity = await requireIdentity(request);
  if (identity instanceof Response) return identity;

  try {
    const result = await syncAttribute();
    return NextResponse.json(result, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
