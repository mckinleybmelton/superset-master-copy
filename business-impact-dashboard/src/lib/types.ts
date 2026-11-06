export type UsageEvent = {
  eventId: string;
  userEmail: string;
  ts: Date;
  model: string | null;
  kind: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  chargedCents: number;
  cloudAgentId: string | null;
  conversationId: string | null;
};

export type JiraIssue = {
  issueKey: string;
  summary: string;
  status: string;
  assigneeEmail: string | null;
  assigneeName: string | null;
  projectKey: string;
  storyPoints: number | null;
  jiraUrl: string | null;
  updatedAt: Date | null;
};

export type IssueWindow = {
  issueKey: string;
  startedAt: Date | null;
  completedAt: Date | null;
  startChangelogId: string | null;
  completeChangelogId: string | null;
};

export type IssueAttribution = {
  issueKey: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  chargedCents: number;
  sharedAttribution: boolean;
  eventCount: number;
  computedAt: Date;
};

export type IssueRow = {
  issueKey: string;
  summary: string;
  status: string;
  assigneeEmail: string | null;
  assigneeName: string | null;
  projectKey: string;
  jiraUrl: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cycleHours: number | null;
  totalTokens: number;
  chargedCents: number;
  sharedAttribution: boolean;
  eventCount: number;
  completed: boolean;
};

export type WeeklyPoint = {
  weekStart: string;
  completedTasks: number;
  totalTokens: number;
  chargedCents: number;
  tokensPerTask: number | null;
  dollarsPerTask: number | null;
};

export type DashboardSummary = {
  usingSampleData: boolean;
  missingSecrets: string[];
  rangeStart: string;
  rangeEnd: string;
  completedTasks: number;
  inFlightTasks: number;
  meanTokensPerTask: number | null;
  medianTokensPerTask: number | null;
  meanDollarsPerTask: number | null;
  medianDollarsPerTask: number | null;
  totalAttributedTokens: number;
  totalAttributedCents: number;
  unattributedTokens: number;
  unattributedCents: number;
  unattributedPct: number | null;
  overlapIssueCount: number;
  emailMismatchCount: number;
  lastSync: {
    cursor: string | null;
    jira: string | null;
    attribute: string | null;
  };
  weekly: WeeklyPoint[];
  issues: IssueRow[];
};

export type ConfigStatus = {
  usageConfigured: boolean;
  jiraConfigured: boolean;
  projectKeys: string[];
  missingSecrets: string[];
  usingSampleData: boolean;
};
