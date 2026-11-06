import { createHash } from "node:crypto";
import { sql } from "./db";

type SampleIssue = {
  key: string;
  summary: string;
  status: string;
  email: string;
  name: string;
  project: string;
  startedOffsetDays: number;
  completedOffsetDays: number | null;
  tokens: number;
  cents: number;
};

const SAMPLE_ISSUES: SampleIssue[] = [
  {
    key: "ENG-1042",
    summary: "Fix checkout race on concurrent carts",
    status: "Done",
    email: "alex@example.com",
    name: "Alex Rivera",
    project: "ENG",
    startedOffsetDays: 28,
    completedOffsetDays: 24,
    tokens: 1_240_000,
    cents: 186,
  },
  {
    key: "ENG-1055",
    summary: "Add SSO group sync for viewers",
    status: "Done",
    email: "sam@example.com",
    name: "Sam Chen",
    project: "ENG",
    startedOffsetDays: 22,
    completedOffsetDays: 17,
    tokens: 2_880_000,
    cents: 412,
  },
  {
    key: "ENG-1061",
    summary: "Reduce dashboard cold-start latency",
    status: "Done",
    email: "alex@example.com",
    name: "Alex Rivera",
    project: "ENG",
    startedOffsetDays: 16,
    completedOffsetDays: 12,
    tokens: 980_000,
    cents: 141,
  },
  {
    key: "DATA-220",
    summary: "Backfill metric certifications",
    status: "Done",
    email: "jordan@example.com",
    name: "Jordan Lee",
    project: "DATA",
    startedOffsetDays: 14,
    completedOffsetDays: 9,
    tokens: 3_450_000,
    cents: 520,
  },
  {
    key: "ENG-1070",
    summary: "Ship MCP chart compile guardrails",
    status: "Done",
    email: "sam@example.com",
    name: "Sam Chen",
    project: "ENG",
    startedOffsetDays: 10,
    completedOffsetDays: 5,
    tokens: 4_120_000,
    cents: 640,
  },
  {
    key: "ENG-1078",
    summary: "Investigate flaky Playwright suite",
    status: "In Progress",
    email: "alex@example.com",
    name: "Alex Rivera",
    project: "ENG",
    startedOffsetDays: 3,
    completedOffsetDays: null,
    tokens: 760_000,
    cents: 98,
  },
  {
    key: "DATA-231",
    summary: "Document semantic provider transport",
    status: "In Progress",
    email: "jordan@example.com",
    name: "Jordan Lee",
    project: "DATA",
    startedOffsetDays: 2,
    completedOffsetDays: null,
    tokens: 510_000,
    cents: 72,
  },
];

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function eventId(parts: string): string {
  return createHash("sha256").update(parts).digest("hex").slice(0, 32);
}

/** Seed deterministic sample rows when live secrets are missing. */
export async function ensureSampleData(): Promise<void> {
  const existing = await sql<{ c: string }>(
    "select count(*)::text as c from jira_issues",
  );
  if (Number(existing[0]?.c ?? 0) > 0) return;

  for (const issue of SAMPLE_ISSUES) {
    const started = daysAgo(issue.startedOffsetDays);
    const completed =
      issue.completedOffsetDays === null
        ? null
        : daysAgo(issue.completedOffsetDays);
    const jiraUrl = `https://example.atlassian.net/browse/${issue.key}`;

    await sql(
      `insert into jira_issues
        (issue_key, summary, status, assignee_email, assignee_name, project_key, story_points, jira_url, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (issue_key) do nothing`,
      [
        issue.key,
        issue.summary,
        issue.status,
        issue.email,
        issue.name,
        issue.project,
        null,
        jiraUrl,
        completed ?? new Date(),
      ],
    );

    await sql(
      `insert into issue_windows
        (issue_key, started_at, completed_at, start_changelog_id, complete_changelog_id)
       values ($1,$2,$3,$4,$5)
       on conflict (issue_key) do nothing`,
      [
        issue.key,
        started,
        completed,
        `sample-start-${issue.key}`,
        completed ? `sample-done-${issue.key}` : null,
      ],
    );

    const hours = Math.max(
      4,
      Math.round(
        ((completed?.getTime() ?? Date.now()) - started.getTime()) /
          (60 * 60 * 1000),
      ),
    );
    const chunks = Math.min(8, Math.max(2, Math.floor(hours / 6)));
    for (let i = 0; i < chunks; i++) {
      const frac = 1 / chunks;
      const ts = new Date(
        started.getTime() +
          ((completed?.getTime() ?? Date.now()) - started.getTime()) *
            ((i + 0.5) / chunks),
      );
      const input = Math.round(issue.tokens * 0.7 * frac);
      const output = Math.round(issue.tokens * 0.3 * frac);
      const cents = issue.cents * frac;
      const id = eventId(`${issue.key}:${i}:${ts.toISOString()}`);
      await sql(
        `insert into usage_events
          (event_id, user_email, ts, model, kind, input_tokens, output_tokens,
           cache_write_tokens, cache_read_tokens, charged_cents, cloud_agent_id, conversation_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         on conflict (event_id) do nothing`,
        [
          id,
          issue.email,
          ts,
          i % 2 === 0 ? "claude-4.6-sonnet" : "gpt-5.4",
          "Usage-based",
          input,
          output,
          0,
          Math.round(input * 0.1),
          cents,
          null,
          `sample-conv-${issue.key}`,
        ],
      );
    }
  }

  // Unattributed spend (no matching Jira window)
  await sql(
    `insert into usage_events
      (event_id, user_email, ts, model, kind, input_tokens, output_tokens,
       cache_write_tokens, cache_read_tokens, charged_cents)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     on conflict (event_id) do nothing`,
    [
      eventId("unattributed-1"),
      "pat@example.com",
      daysAgo(6),
      "claude-4.6-sonnet",
      "Usage-based",
      420_000,
      80_000,
      0,
      40_000,
      65,
    ],
  );

  await sql(
    `insert into sync_runs (source, status, finished_at, detail)
     values ('sample', 'ok', now(), $1::jsonb)`,
    [JSON.stringify({ note: "Seeded sample data" })],
  );
}
