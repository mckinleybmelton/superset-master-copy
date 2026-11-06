import {
  DONE_STATUSES,
  getJiraApiToken,
  getJiraBaseUrl,
  getJiraEmail,
  getJiraProjectKeys,
  IN_PROGRESS_STATUSES,
} from "./config";
import { sql } from "./db";
import type { IssueWindow, JiraIssue } from "./types";

type JiraUser = {
  displayName?: string;
  emailAddress?: string;
  accountId?: string;
};

type JiraStatus = { name?: string };

type JiraFields = {
  summary?: string;
  status?: JiraStatus;
  assignee?: JiraUser | null;
  updated?: string;
  project?: { key?: string };
  customfield_10016?: number | null;
};

type JiraIssueRaw = {
  key: string;
  fields?: JiraFields;
  self?: string;
};

type JiraSearchResponse = {
  issues?: JiraIssueRaw[];
  startAt?: number;
  maxResults?: number;
  total?: number;
};

type ChangelogItem = {
  field?: string;
  fromString?: string | null;
  toString?: string | null;
};

type ChangelogHistory = {
  id?: string;
  created?: string;
  items?: ChangelogItem[];
};

type ChangelogResponse = {
  values?: ChangelogHistory[];
  startAt?: number;
  maxResults?: number;
  total?: number;
  isLast?: boolean;
};

function authHeader(): string {
  const email = getJiraEmail();
  const token = getJiraApiToken();
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

function browseUrl(base: string, key: string): string {
  return `${base}/browse/${key}`;
}

function normalizeStatus(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

function isInProgress(name: string | null | undefined): boolean {
  return IN_PROGRESS_STATUSES.has(normalizeStatus(name));
}

function isDone(name: string | null | undefined): boolean {
  return DONE_STATUSES.has(normalizeStatus(name));
}

async function jiraFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getJiraBaseUrl();
  if (!base || !getJiraEmail() || !getJiraApiToken()) {
    throw new Error("Jira credentials are not configured");
  }
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Jira API ${res.status}: ${text.slice(0, 400) || res.statusText}`,
    );
  }
  return (await res.json()) as T;
}

export async function searchRecentIssues(lookbackDays: number): Promise<
  JiraIssue[]
> {
  const projects = getJiraProjectKeys();
  if (projects.length === 0) {
    throw new Error("JIRA_PROJECT_KEYS is not configured");
  }
  const projectList = projects.map((p) => `"${p.replace(/"/g, "")}"`).join(",");
  const jql = `project in (${projectList}) AND updated >= -${lookbackDays}d ORDER BY updated DESC`;
  const base = getJiraBaseUrl();
  const collected: JiraIssue[] = [];
  let startAt = 0;
  const maxResults = 50;
  let total = Infinity;

  while (startAt < total && collected.length < 2000) {
    const data = await jiraFetch<JiraSearchResponse>(
      `/rest/api/3/search?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}&fields=summary,status,assignee,updated,project,customfield_10016`,
    );
    total = data.total ?? 0;
    for (const issue of data.issues ?? []) {
      const fields = issue.fields ?? {};
      collected.push({
        issueKey: issue.key,
        summary: fields.summary ?? issue.key,
        status: fields.status?.name ?? "Unknown",
        assigneeEmail: fields.assignee?.emailAddress?.toLowerCase() ?? null,
        assigneeName: fields.assignee?.displayName ?? null,
        projectKey: fields.project?.key ?? issue.key.split("-")[0] ?? "UNK",
        storyPoints:
          typeof fields.customfield_10016 === "number"
            ? fields.customfield_10016
            : null,
        jiraUrl: browseUrl(base, issue.key),
        updatedAt: fields.updated ? new Date(fields.updated) : null,
      });
    }
    startAt += maxResults;
    if ((data.issues?.length ?? 0) === 0) break;
  }

  return collected;
}

export async function fetchIssueWindow(
  issueKey: string,
): Promise<IssueWindow> {
  let startedAt: Date | null = null;
  let completedAt: Date | null = null;
  let startChangelogId: string | null = null;
  let completeChangelogId: string | null = null;

  let startAt = 0;
  const maxResults = 100;
  let isLast = false;

  while (!isLast) {
    const data = await jiraFetch<ChangelogResponse>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/changelog?startAt=${startAt}&maxResults=${maxResults}`,
    );
    for (const history of data.values ?? []) {
      const created = history.created ? new Date(history.created) : null;
      if (!created) continue;
      for (const item of history.items ?? []) {
        if (item.field !== "status") continue;
        if (!startedAt && isInProgress(item.toString)) {
          startedAt = created;
          startChangelogId = history.id ?? null;
        }
        if (isDone(item.toString)) {
          completedAt = created;
          completeChangelogId = history.id ?? null;
        }
      }
    }
    isLast = Boolean(data.isLast) || (data.values?.length ?? 0) === 0;
    startAt += maxResults;
    if (startAt > 5000) break;
  }

  return {
    issueKey,
    startedAt,
    completedAt,
    startChangelogId,
    completeChangelogId,
  };
}

export async function upsertIssues(issues: JiraIssue[]): Promise<number> {
  let n = 0;
  for (const issue of issues) {
    await sql(
      `insert into jira_issues
        (issue_key, summary, status, assignee_email, assignee_name, project_key,
         story_points, jira_url, updated_at, synced_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
       on conflict (issue_key) do update set
         summary = excluded.summary,
         status = excluded.status,
         assignee_email = excluded.assignee_email,
         assignee_name = excluded.assignee_name,
         project_key = excluded.project_key,
         story_points = excluded.story_points,
         jira_url = excluded.jira_url,
         updated_at = excluded.updated_at,
         synced_at = now()`,
      [
        issue.issueKey,
        issue.summary,
        issue.status,
        issue.assigneeEmail,
        issue.assigneeName,
        issue.projectKey,
        issue.storyPoints,
        issue.jiraUrl,
        issue.updatedAt,
      ],
    );
    n += 1;
  }
  return n;
}

export async function upsertWindow(window: IssueWindow): Promise<void> {
  await sql(
    `insert into issue_windows
      (issue_key, started_at, completed_at, start_changelog_id, complete_changelog_id, synced_at)
     values ($1,$2,$3,$4,$5, now())
     on conflict (issue_key) do update set
       started_at = excluded.started_at,
       completed_at = excluded.completed_at,
       start_changelog_id = excluded.start_changelog_id,
       complete_changelog_id = excluded.complete_changelog_id,
       synced_at = now()`,
    [
      window.issueKey,
      window.startedAt,
      window.completedAt,
      window.startChangelogId,
      window.completeChangelogId,
    ],
  );
}

export async function syncJira(lookbackDays: number): Promise<{
  issues: number;
  windows: number;
}> {
  const issues = await searchRecentIssues(lookbackDays);
  const upsertedIssues = await upsertIssues(issues);
  let windows = 0;
  for (const issue of issues) {
    const window = await fetchIssueWindow(issue.issueKey);
    // If never entered In Progress but currently Done, fall back to updated_at span
    if (!window.startedAt && issue.updatedAt) {
      window.startedAt = issue.updatedAt;
    }
    if (
      !window.completedAt &&
      isDone(issue.status) &&
      issue.updatedAt
    ) {
      window.completedAt = issue.updatedAt;
    }
    await upsertWindow(window);
    windows += 1;
  }
  return { issues: upsertedIssues, windows };
}
