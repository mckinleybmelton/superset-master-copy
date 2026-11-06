/**
 * Jira project config for factory ticket SoT.
 */

export type JiraFactoryConfig = {
  projectKey: string | null;
  factoryLabel: string;
};

export function readJiraFactoryConfig(): JiraFactoryConfig {
  const projectKey =
    process.env.FACTORY_JIRA_PROJECT?.trim() ||
    process.env.JIRA_PROJECT_KEY?.trim() ||
    null;
  return {
    projectKey,
    factoryLabel:
      process.env.FACTORY_JIRA_LABEL?.trim() ||
      process.env.FACTORY_ISSUE_LABEL?.trim() ||
      "factory",
  };
}

/** Match PROJ-123 style keys in free text. */
const JIRA_KEY_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/;

export function extractJiraKey(text: string): string | null {
  const match = text.toUpperCase().match(JIRA_KEY_RE);
  return match?.[1] ?? null;
}

/** Normalize a freeform description into a Jira summary (≤255 chars). */
export function normalizeJiraSummary(description: string): string {
  const oneLine = description.replace(/\s+/g, " ").trim();
  if (oneLine.length === 0) {
    return "Factory change request";
  }
  if (oneLine.length <= 255) {
    return oneLine;
  }
  return `${oneLine.slice(0, 252)}...`;
}

/**
 * Decide whether a search hit should be auto-bound.
 * Exact summary match (case-insensitive) on a single candidate only.
 */
export function shouldAutoBindSearchHit(input: {
  normalizedTitle: string;
  candidates: readonly { key: string; summary: string }[];
}): { action: "bind"; key: string } | { action: "create" } {
  const title = input.normalizedTitle.trim().toLowerCase();
  const exact = input.candidates.filter(
    (c) => c.summary.trim().toLowerCase() === title,
  );
  if (exact.length === 1) {
    return { action: "bind", key: exact[0]!.key };
  }
  return { action: "create" };
}
