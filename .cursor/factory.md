# Superset software factory

In-repo AI factory under [`factory/`](../factory/).

## Grok Bot (entry point)

- **Peer:** `orchestrator` (Grok 4.7)
- **Surface now:** playground / `agent-sdk run` / `chat` (Slack deferred)
- **Ticket SoT:** Jira (`FACTORY_JIRA_PROJECT`) — find or create, then advance stage labels
- **Code SoT:** GitHub PRs on this fork

## Quick start

```bash
cd factory
./scripts/setup-factory.sh --jira-project YOURKEY
# Connect Atlassian + GitHub MCP, then:
./scripts/serve-factory.sh
```

Playground: http://127.0.0.1:3000/orchestrator/playground

Example: `I want SqlLab to show a read-only factory stage badge.`

Docs: [`factory/README.md`](../factory/README.md), [`factory/docs/config-checklist.md`](../factory/docs/config-checklist.md).
