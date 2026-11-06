import { recomputeAttribution } from "./attribute";
import { DEFAULT_LOOKBACK_DAYS, getConfigStatus } from "./config";
import { syncCursorUsage } from "./cursor-usage";
import { sql } from "./db";
import { syncJira } from "./jira";
import { ensureSampleData } from "./sample-data";

async function recordSync(
  source: string,
  run: () => Promise<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const started = await sql<{ id: string }>(
    `insert into sync_runs (source, status) values ($1, 'running') returning id::text`,
    [source],
  );
  const id = started[0]?.id;
  try {
    const detail = await run();
    await sql(
      `update sync_runs set status = 'ok', finished_at = now(), detail = $2::jsonb where id = $1::bigint`,
      [id, JSON.stringify(detail)],
    );
    return detail;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await sql(
      `update sync_runs set status = 'error', finished_at = now(), error = $2 where id = $1::bigint`,
      [id, message],
    );
    throw error;
  }
}

export async function syncCursor(lookbackDays = DEFAULT_LOOKBACK_DAYS) {
  return recordSync("cursor", async () => syncCursorUsage(lookbackDays));
}

export async function syncJiraIssues(lookbackDays = DEFAULT_LOOKBACK_DAYS) {
  return recordSync("jira", async () => syncJira(lookbackDays));
}

export async function syncAttribute() {
  return recordSync("attribute", async () => recomputeAttribution());
}

export async function syncAll(lookbackDays = DEFAULT_LOOKBACK_DAYS) {
  const config = getConfigStatus();
  if (config.usingSampleData) {
    await ensureSampleData();
    const attribute = await syncAttribute();
    return {
      mode: "sample" as const,
      missingSecrets: config.missingSecrets,
      attribute,
    };
  }

  const cursor = await syncCursor(lookbackDays);
  const jira = await syncJiraIssues(lookbackDays);
  const attribute = await syncAttribute();
  return {
    mode: "live" as const,
    cursor,
    jira,
    attribute,
  };
}
