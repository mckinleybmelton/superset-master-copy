import { getConfigStatus } from "./config";
import { sql } from "./db";
import { ensureSampleData } from "./sample-data";
import type {
  DashboardSummary,
  IssueRow,
  WeeklyPoint,
} from "./types";

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

type IssueQueryRow = {
  issue_key: string;
  summary: string;
  status: string;
  assignee_email: string | null;
  assignee_name: string | null;
  project_key: string;
  jira_url: string | null;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  total_tokens: string | number | null;
  charged_cents: string | number | null;
  shared_attribution: boolean | null;
  event_count: string | number | null;
};

type MetaRow = {
  unattributed_tokens: string | number;
  unattributed_charged_cents: string | number;
  overlap_issue_count: string | number;
  email_mismatch_count: string | number;
};

type SyncRow = {
  source: string;
  finished_at: Date | string | null;
};

function weekStartIso(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay();
  const diff = (day + 6) % 7;
  x.setUTCDate(x.getUTCDate() - diff);
  return x.toISOString().slice(0, 10);
}

export async function buildDashboard(params: {
  rangeStart: Date;
  rangeEnd: Date;
  projectKey?: string | null;
  includeInFlight: boolean;
}): Promise<DashboardSummary> {
  const config = getConfigStatus();
  if (config.usingSampleData) {
    await ensureSampleData();
    const attrCount = await sql<{ c: string }>(
      "select count(*)::text as c from issue_attribution",
    );
    if (Number(attrCount[0]?.c ?? 0) === 0) {
      const { recomputeAttribution } = await import("./attribute");
      await recomputeAttribution();
    }
  }

  const projectFilter = params.projectKey?.trim() || null;
  const rows = await sql<IssueQueryRow>(
    `select i.issue_key, i.summary, i.status, i.assignee_email, i.assignee_name,
            i.project_key, i.jira_url, w.started_at, w.completed_at,
            a.total_tokens, a.charged_cents, a.shared_attribution, a.event_count
     from jira_issues i
     left join issue_windows w on w.issue_key = i.issue_key
     left join issue_attribution a on a.issue_key = i.issue_key
     where ($1::text is null or i.project_key = $1)
     order by coalesce(w.completed_at, w.started_at, i.updated_at) desc nulls last`,
    [projectFilter],
  );

  const rangeStartMs = params.rangeStart.getTime();
  const rangeEndMs = params.rangeEnd.getTime();

  const issues: IssueRow[] = [];
  for (const row of rows) {
    const started = row.started_at ? new Date(row.started_at) : null;
    const completed = row.completed_at ? new Date(row.completed_at) : null;
    const completedFlag = Boolean(completed);
    if (!params.includeInFlight && !completedFlag) continue;

    const anchor = completed ?? started;
    if (anchor) {
      const t = anchor.getTime();
      if (t < rangeStartMs || t > rangeEndMs) continue;
    }

    const cycleHours =
      started && completed
        ? (completed.getTime() - started.getTime()) / (60 * 60 * 1000)
        : started
          ? (Date.now() - started.getTime()) / (60 * 60 * 1000)
          : null;

    issues.push({
      issueKey: row.issue_key,
      summary: row.summary,
      status: row.status,
      assigneeEmail: row.assignee_email,
      assigneeName: row.assignee_name,
      projectKey: row.project_key,
      jiraUrl: row.jira_url,
      startedAt: toIso(started),
      completedAt: toIso(completed),
      cycleHours,
      totalTokens: Number(row.total_tokens ?? 0),
      chargedCents: Number(row.charged_cents ?? 0),
      sharedAttribution: Boolean(row.shared_attribution),
      eventCount: Number(row.event_count ?? 0),
      completed: completedFlag,
    });
  }

  const completed = issues.filter((i) => i.completed);
  const tokenValues = completed.map((i) => i.totalTokens);
  const dollarValues = completed.map((i) => i.chargedCents / 100);
  const totalAttributedTokens = issues.reduce((s, i) => s + i.totalTokens, 0);
  const totalAttributedCents = issues.reduce((s, i) => s + i.chargedCents, 0);

  const meta =
    (
      await sql<MetaRow>(
        `select unattributed_tokens, unattributed_charged_cents,
                overlap_issue_count, email_mismatch_count
         from attribution_meta where id = 1`,
      )
    )[0] ?? null;

  const unattributedTokens = Number(meta?.unattributed_tokens ?? 0);
  const unattributedCents = Number(meta?.unattributed_charged_cents ?? 0);
  const denom = totalAttributedTokens + unattributedTokens;
  const unattributedPct = denom > 0 ? (unattributedTokens / denom) * 100 : null;

  const weeklyMap = new Map<string, WeeklyPoint>();
  for (const issue of completed) {
    if (!issue.completedAt) continue;
    const key = weekStartIso(new Date(issue.completedAt));
    const point = weeklyMap.get(key) ?? {
      weekStart: key,
      completedTasks: 0,
      totalTokens: 0,
      chargedCents: 0,
      tokensPerTask: null,
      dollarsPerTask: null,
    };
    point.completedTasks += 1;
    point.totalTokens += issue.totalTokens;
    point.chargedCents += issue.chargedCents;
    weeklyMap.set(key, point);
  }
  const weekly = [...weeklyMap.values()]
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .map((p) => ({
      ...p,
      tokensPerTask:
        p.completedTasks > 0 ? p.totalTokens / p.completedTasks : null,
      dollarsPerTask:
        p.completedTasks > 0 ? p.chargedCents / 100 / p.completedTasks : null,
    }));

  const syncs = await sql<SyncRow>(
    `select distinct on (source) source, finished_at
     from sync_runs
     where status = 'ok'
     order by source, finished_at desc nulls last`,
  );
  const lastSync = {
    cursor: toIso(syncs.find((s) => s.source === "cursor")?.finished_at ?? null),
    jira: toIso(syncs.find((s) => s.source === "jira")?.finished_at ?? null),
    attribute: toIso(
      syncs.find((s) => s.source === "attribute" || s.source === "sample")
        ?.finished_at ?? null,
    ),
  };

  return {
    usingSampleData: config.usingSampleData,
    missingSecrets: config.missingSecrets,
    rangeStart: params.rangeStart.toISOString(),
    rangeEnd: params.rangeEnd.toISOString(),
    completedTasks: completed.length,
    inFlightTasks: issues.filter((i) => !i.completed).length,
    meanTokensPerTask: mean(tokenValues),
    medianTokensPerTask: median(tokenValues),
    meanDollarsPerTask: mean(dollarValues),
    medianDollarsPerTask: median(dollarValues),
    totalAttributedTokens,
    totalAttributedCents,
    unattributedTokens,
    unattributedCents,
    unattributedPct,
    overlapIssueCount: Number(meta?.overlap_issue_count ?? 0),
    emailMismatchCount: Number(meta?.email_mismatch_count ?? 0),
    lastSync,
    weekly,
    issues,
  };
}
