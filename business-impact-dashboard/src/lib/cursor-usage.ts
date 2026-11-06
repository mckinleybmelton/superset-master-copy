import { createHash } from "node:crypto";
import { getUsageAdminApiKey } from "./config";
import { sql } from "./db";
import type { UsageEvent } from "./types";

type CursorTokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
  totalCents?: number;
};

type CursorUsageEventRaw = {
  timestamp?: string | number;
  userEmail?: string;
  model?: string;
  kind?: string;
  chargedCents?: number;
  cloudAgentId?: string;
  conversationId?: string;
  tokenUsage?: CursorTokenUsage;
  isTokenBasedCall?: boolean;
};

type FilteredUsageResponse = {
  usageEvents?: CursorUsageEventRaw[];
  pagination?: { numPages?: number; currentPage?: number };
  totalUsageEventsCount?: number;
};

function basicAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

function eventIdFor(raw: CursorUsageEventRaw): string {
  const material = [
    String(raw.timestamp ?? ""),
    raw.userEmail ?? "",
    raw.model ?? "",
    String(raw.tokenUsage?.inputTokens ?? 0),
    String(raw.tokenUsage?.outputTokens ?? 0),
    String(raw.chargedCents ?? ""),
    raw.cloudAgentId ?? "",
    raw.conversationId ?? "",
  ].join("|");
  return createHash("sha256").update(material).digest("hex").slice(0, 40);
}

function normalizeEvent(raw: CursorUsageEventRaw): UsageEvent | null {
  if (!raw.userEmail || raw.timestamp == null) return null;
  const tsMs = Number(raw.timestamp);
  if (!Number.isFinite(tsMs)) return null;
  const tu = raw.tokenUsage ?? {};
  return {
    eventId: eventIdFor(raw),
    userEmail: raw.userEmail.toLowerCase(),
    ts: new Date(tsMs),
    model: raw.model ?? null,
    kind: raw.kind ?? null,
    inputTokens: Number(tu.inputTokens ?? 0),
    outputTokens: Number(tu.outputTokens ?? 0),
    cacheWriteTokens: Number(tu.cacheWriteTokens ?? 0),
    cacheReadTokens: Number(tu.cacheReadTokens ?? 0),
    chargedCents: Number(raw.chargedCents ?? tu.totalCents ?? 0),
    cloudAgentId: raw.cloudAgentId ?? null,
    conversationId: raw.conversationId ?? null,
  };
}

export async function fetchUsageEvents(params: {
  startDate: Date;
  endDate: Date;
  email?: string;
}): Promise<UsageEvent[]> {
  const apiKey = getUsageAdminApiKey();
  if (!apiKey) {
    throw new Error("USAGE_ADMIN_API_KEY is not configured");
  }

  const collected: UsageEvent[] = [];
  let page = 1;
  let numPages = 1;

  while (page <= numPages) {
    const res = await fetch(
      "https://api.cursor.com/teams/filtered-usage-events",
      {
        method: "POST",
        headers: {
          Authorization: basicAuthHeader(apiKey),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: params.startDate.getTime(),
          endDate: params.endDate.getTime(),
          page,
          pageSize: 1000,
          ...(params.email ? { email: params.email } : {}),
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Cursor usage API ${res.status}: ${text.slice(0, 400) || res.statusText}`,
      );
    }

    const data = (await res.json()) as FilteredUsageResponse;
    numPages = Math.max(1, data.pagination?.numPages ?? 1);
    for (const raw of data.usageEvents ?? []) {
      const event = normalizeEvent(raw);
      if (event) collected.push(event);
    }
    page += 1;
    if (page > 200) break;
  }

  return collected;
}

export async function upsertUsageEvents(events: UsageEvent[]): Promise<number> {
  let upserted = 0;
  for (const event of events) {
    await sql(
      `insert into usage_events
        (event_id, user_email, ts, model, kind, input_tokens, output_tokens,
         cache_write_tokens, cache_read_tokens, charged_cents, cloud_agent_id, conversation_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       on conflict (event_id) do update set
         charged_cents = excluded.charged_cents,
         input_tokens = excluded.input_tokens,
         output_tokens = excluded.output_tokens,
         cache_write_tokens = excluded.cache_write_tokens,
         cache_read_tokens = excluded.cache_read_tokens`,
      [
        event.eventId,
        event.userEmail,
        event.ts,
        event.model,
        event.kind,
        event.inputTokens,
        event.outputTokens,
        event.cacheWriteTokens,
        event.cacheReadTokens,
        event.chargedCents,
        event.cloudAgentId,
        event.conversationId,
      ],
    );
    upserted += 1;
  }
  return upserted;
}

export async function syncCursorUsage(lookbackDays: number): Promise<{
  upserted: number;
  startDate: string;
  endDate: string;
}> {
  const endDate = new Date();
  const startDate = new Date(
    endDate.getTime() - lookbackDays * 24 * 60 * 60 * 1000,
  );
  const events = await fetchUsageEvents({ startDate, endDate });
  const upserted = await upsertUsageEvents(events);
  return {
    upserted,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
}
