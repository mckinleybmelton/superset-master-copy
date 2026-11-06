create table if not exists usage_events (
  event_id text primary key,
  user_email text not null,
  ts timestamptz not null,
  model text,
  kind text,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cache_write_tokens bigint not null default 0,
  cache_read_tokens bigint not null default 0,
  charged_cents double precision not null default 0,
  cloud_agent_id text,
  conversation_id text,
  raw_json jsonb,
  ingested_at timestamptz not null default now()
);

create index if not exists usage_events_email_ts_idx
  on usage_events (user_email, ts);

create table if not exists jira_issues (
  issue_key text primary key,
  summary text not null,
  status text not null,
  assignee_email text,
  assignee_name text,
  project_key text not null,
  story_points double precision,
  jira_url text,
  updated_at timestamptz,
  synced_at timestamptz not null default now()
);

create index if not exists jira_issues_project_idx on jira_issues (project_key);
create index if not exists jira_issues_assignee_idx on jira_issues (assignee_email);

create table if not exists issue_windows (
  issue_key text primary key references jira_issues (issue_key) on delete cascade,
  started_at timestamptz,
  completed_at timestamptz,
  start_changelog_id text,
  complete_changelog_id text,
  synced_at timestamptz not null default now()
);

create index if not exists issue_windows_started_idx on issue_windows (started_at);
create index if not exists issue_windows_completed_idx on issue_windows (completed_at);

create table if not exists issue_attribution (
  issue_key text primary key references jira_issues (issue_key) on delete cascade,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cache_write_tokens bigint not null default 0,
  cache_read_tokens bigint not null default 0,
  total_tokens bigint not null default 0,
  charged_cents double precision not null default 0,
  shared_attribution boolean not null default false,
  event_count integer not null default 0,
  computed_at timestamptz not null default now()
);

create table if not exists sync_runs (
  id bigserial primary key,
  source text not null,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  detail jsonb,
  error text
);

create table if not exists attribution_meta (
  id integer primary key check (id = 1),
  unattributed_tokens bigint not null default 0,
  unattributed_charged_cents double precision not null default 0,
  overlap_issue_count integer not null default 0,
  email_mismatch_count integer not null default 0,
  computed_at timestamptz not null default now()
);
