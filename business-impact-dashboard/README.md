# Impact — Cursor tokens per Jira task

Cursor-hosted business impact dashboard. Attributes Cursor Admin API usage
events to Jira issues by each assignee’s In Progress → Done window.

## Local development

```bash
npm install
env -u DATABASE_URL npm run dev
```

Without secrets, the app seeds labeled sample data automatically.

## Secrets (published app)

- `USAGE_ADMIN_API_KEY` — **Team** Admin API key with `admin:*` scope from
  [cursor.com/dashboard](https://cursor.com/dashboard) → API Keys → **Team** tab.
  Personal keys, Cloud Agents keys, and service-account tokens return 403 on
  `/teams/filtered-usage-events` (`Service token owner does not match this API route`).
  Key shape looks like `crsr_…`. Requires Enterprise / team admin.
- `JIRA_BASE_URL` — e.g. `https://your-site.atlassian.net`
- `JIRA_EMAIL`
- `JIRA_API_TOKEN`
- `JIRA_PROJECT_KEYS` — comma-separated project keys

## Sync

Use **Refresh** in the UI (`POST /api/sync/all`). No ambient agents required;
usage and Jira changelogs are joined retrospectively.
