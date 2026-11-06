# Factory config checklist

## Environment

| Variable | Purpose | Default |
| --- | --- | --- |
| `FACTORY_PRODUCT_REPO` | GitHub `owner/name` for PRs | `mckinleybmelton/superset-master-copy` |
| `FACTORY_PRODUCT_DEFAULT_BRANCH` | PR base | `master` |
| `FACTORY_PRODUCT_REPO_PATH` | Local checkout for worktrees | unset |
| `FACTORY_ISSUE_LABEL` | Backlog filter | `factory` |
| `ORCHESTRATOR_SLACK_BOT_TOKEN` | Grok Bot token | from `slack create` |
| `ORCHESTRATOR_SLACK_APP_TOKEN` | Socket Mode app token | from `slack create` |
| `FACTORY_GITHUB_CURSOR_EVENTS` | Set `1` to enable implementer/reviewer `cursorAccount` GitHub wakes | unset (local unsigned) |

## Auth

1. `npx @grok/agent-sdk@0.6.0 login` (or `CURSOR_API_KEY`)
2. Connect **GitHub** under Cursor MCP connectors
3. Slack: `cd factory/agents/orchestrator && npx @grok/agent-sdk@0.6.0 slack create --dir . --name "Superset Factory"`
4. `npx @grok/agent-sdk@0.6.0 slack doctor --prefix ORCHESTRATOR`

## Human gates

Never auto-approve `prd_review`, `design_review`, `architecture_review`, or `pr_review`. Grok Bot stops and asks you in Slack.
