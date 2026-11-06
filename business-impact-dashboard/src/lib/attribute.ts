import { sql } from "./db";

type WindowRow = {
  issue_key: string;
  assignee_email: string | null;
  started_at: Date | string | null;
  completed_at: Date | string | null;
};

type EventRow = {
  event_id: string;
  user_email: string;
  ts: Date | string;
  input_tokens: string | number;
  output_tokens: string | number;
  cache_write_tokens: string | number;
  cache_read_tokens: string | number;
  charged_cents: string | number;
};

type Accumulator = {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  chargedCents: number;
  eventCount: number;
  shared: boolean;
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function num(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

function emptyAcc(): Accumulator {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    chargedCents: 0,
    eventCount: 0,
    shared: false,
  };
}

/**
 * Attribute usage events into issue windows by assignee email + time.
 * Overlapping windows for the same email split each event equally.
 */
export async function recomputeAttribution(): Promise<{
  attributedIssues: number;
  unattributedTokens: number;
  unattributedCents: number;
  overlapIssueCount: number;
  emailMismatchCount: number;
}> {
  const windows = await sql<WindowRow>(
    `select w.issue_key, i.assignee_email, w.started_at, w.completed_at
     from issue_windows w
     join jira_issues i on i.issue_key = w.issue_key
     where w.started_at is not null`,
  );

  const events = await sql<EventRow>(
    `select event_id, user_email, ts, input_tokens, output_tokens,
            cache_write_tokens, cache_read_tokens, charged_cents
     from usage_events`,
  );

  const now = Date.now();
  const parsedWindows = windows
    .map((w) => {
      const started = toDate(w.started_at);
      if (!started) return null;
      const completed = toDate(w.completed_at);
      return {
        issueKey: w.issue_key,
        email: (w.assignee_email ?? "").toLowerCase(),
        startedMs: started.getTime(),
        completedMs: completed ? completed.getTime() : now,
      };
    })
    .filter((w): w is NonNullable<typeof w> => Boolean(w));

  const byIssue = new Map<string, Accumulator>();
  for (const w of parsedWindows) byIssue.set(w.issueKey, emptyAcc());

  let unattributedTokens = 0;
  let unattributedCents = 0;
  const overlapIssues = new Set<string>();
  const emailsWithEvents = new Set(
    events.map((e) => e.user_email.toLowerCase()),
  );
  const emailsWithWindows = new Set(
    parsedWindows.map((w) => w.email).filter(Boolean),
  );
  let emailMismatchCount = 0;
  for (const email of emailsWithWindows) {
    if (email && !emailsWithEvents.has(email)) emailMismatchCount += 1;
  }

  for (const event of events) {
    const ts = toDate(event.ts);
    if (!ts) continue;
    const tsMs = ts.getTime();
    const email = event.user_email.toLowerCase();
    const matches = parsedWindows.filter(
      (w) =>
        w.email &&
        w.email === email &&
        tsMs >= w.startedMs &&
        tsMs <= w.completedMs,
    );

    const input = num(event.input_tokens);
    const output = num(event.output_tokens);
    const cacheWrite = num(event.cache_write_tokens);
    const cacheRead = num(event.cache_read_tokens);
    const cents = num(event.charged_cents);
    const totalTokens = input + output + cacheWrite + cacheRead;

    if (matches.length === 0) {
      unattributedTokens += totalTokens;
      unattributedCents += cents;
      continue;
    }

    const share = 1 / matches.length;
    const shared = matches.length > 1;
    for (const match of matches) {
      const acc = byIssue.get(match.issueKey) ?? emptyAcc();
      acc.inputTokens += input * share;
      acc.outputTokens += output * share;
      acc.cacheWriteTokens += cacheWrite * share;
      acc.cacheReadTokens += cacheRead * share;
      acc.chargedCents += cents * share;
      acc.eventCount += 1;
      if (shared) {
        acc.shared = true;
        overlapIssues.add(match.issueKey);
      }
      byIssue.set(match.issueKey, acc);
    }
  }

  await sql("delete from issue_attribution");
  for (const [issueKey, acc] of byIssue) {
    const totalTokens = Math.round(
      acc.inputTokens +
        acc.outputTokens +
        acc.cacheWriteTokens +
        acc.cacheReadTokens,
    );
    await sql(
      `insert into issue_attribution
        (issue_key, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens,
         total_tokens, charged_cents, shared_attribution, event_count, computed_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())`,
      [
        issueKey,
        Math.round(acc.inputTokens),
        Math.round(acc.outputTokens),
        Math.round(acc.cacheWriteTokens),
        Math.round(acc.cacheReadTokens),
        totalTokens,
        acc.chargedCents,
        acc.shared,
        acc.eventCount,
      ],
    );
  }

  await sql(
    `insert into attribution_meta
      (id, unattributed_tokens, unattributed_charged_cents, overlap_issue_count,
       email_mismatch_count, computed_at)
     values (1, $1, $2, $3, $4, now())
     on conflict (id) do update set
       unattributed_tokens = excluded.unattributed_tokens,
       unattributed_charged_cents = excluded.unattributed_charged_cents,
       overlap_issue_count = excluded.overlap_issue_count,
       email_mismatch_count = excluded.email_mismatch_count,
       computed_at = now()`,
    [
      Math.round(unattributedTokens),
      unattributedCents,
      overlapIssues.size,
      emailMismatchCount,
    ],
  );

  return {
    attributedIssues: byIssue.size,
    unattributedTokens: Math.round(unattributedTokens),
    unattributedCents,
    overlapIssueCount: overlapIssues.size,
    emailMismatchCount,
  };
}
