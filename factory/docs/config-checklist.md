# Factory config checklist

## Environment

| Variable | Purpose | Default |
| --- | --- | --- |
| `FACTORY_JIRA_PROJECT` | Jira project key (ticket SoT) | required for live Jira |
| `FACTORY_JIRA_LABEL` | Marker label alongside stage labels | `factory` |
| `FACTORY_PRODUCT_REPO` | GitHub `owner/name` for PRs | `mckinleybmelton/superset-master-copy` |
| `FACTORY_PRODUCT_DEFAULT_BRANCH` | PR base | `master` |
| `FACTORY_PRODUCT_REPO_PATH` | Local checkout for worktrees | unset |
| `ORCHESTRATOR_SLACK_BOT_TOKEN` | Slack Grok Bot (deferred) | from `slack create` |
| `ORCHESTRATOR_SLACK_APP_TOKEN` | Socket Mode app token (deferred) | from `slack create` |
| `FACTORY_GITHUB_CURSOR_EVENTS` | Enable implementer/reviewer GitHub cursorAccount wakes | unset |

## Jira labels (create once in the project)

Exactly one factory stage label on each ticket, plus the marker:

`factory`, `prd_draft`, `prd_review`, `design_draft`, `design_review`, `architecture_draft`, `architecture_review`, `implementation`, `pr_review`, `done`

## Auth

1. `npx @grok/agent-sdk@0.6.0 login` (or `CURSOR_API_KEY`)
2. Connect **Atlassian** and **GitHub** under Cursor MCP connectors
3. Set `FACTORY_JIRA_PROJECT` in `factory/.env.factory`
4. Slack mint is deferred until a Cursor team is available

## Human gates

Never auto-approve `prd_review`, `design_review`, `architecture_review`, or `pr_review`. Grok Bot stops and asks you in the playground/chat (or Slack later).
