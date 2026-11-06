import type { ConfigStatus } from "./types";

function trimEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function getUsageAdminApiKey(): string {
  return trimEnv("USAGE_ADMIN_API_KEY");
}

export function getJiraBaseUrl(): string {
  return trimEnv("JIRA_BASE_URL").replace(/\/$/, "");
}

export function getJiraEmail(): string {
  return trimEnv("JIRA_EMAIL");
}

export function getJiraApiToken(): string {
  return trimEnv("JIRA_API_TOKEN");
}

export function getJiraProjectKeys(): string[] {
  return trimEnv("JIRA_PROJECT_KEYS")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

export function getConfigStatus(): ConfigStatus {
  const missing: string[] = [];
  if (!getUsageAdminApiKey()) missing.push("USAGE_ADMIN_API_KEY");
  if (!getJiraBaseUrl()) missing.push("JIRA_BASE_URL");
  if (!getJiraEmail()) missing.push("JIRA_EMAIL");
  if (!getJiraApiToken()) missing.push("JIRA_API_TOKEN");
  if (getJiraProjectKeys().length === 0) missing.push("JIRA_PROJECT_KEYS");

  const usageConfigured = Boolean(getUsageAdminApiKey());
  const jiraConfigured =
    Boolean(getJiraBaseUrl()) &&
    Boolean(getJiraEmail()) &&
    Boolean(getJiraApiToken()) &&
    getJiraProjectKeys().length > 0;

  return {
    usageConfigured,
    jiraConfigured,
    projectKeys: getJiraProjectKeys(),
    missingSecrets: missing,
    usingSampleData: !(usageConfigured && jiraConfigured),
  };
}

export const DEFAULT_LOOKBACK_DAYS = 90;

export const IN_PROGRESS_STATUSES = new Set(
  ["in progress", "in development", "in review", "doing", "active"].map((s) =>
    s.toLowerCase(),
  ),
);

export const DONE_STATUSES = new Set(
  ["done", "closed", "resolved", "complete", "completed", "shipped"].map((s) =>
    s.toLowerCase(),
  ),
);
