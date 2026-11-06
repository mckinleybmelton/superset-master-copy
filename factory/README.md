# Superset software factory

In-repo multi-agent factory for an AI-first Superset workflow.

**Grok Bot** is the **orchestrator** peer (Grok 4.7 via `@grok/agent-sdk`). You describe a change; Grok Bot finds or creates a **Jira** task, then routes specialist peers through the SDLC while updating that ticket’s stage labels. GitHub is for PRs only.

```text
You describe change → Grok Bot → Jira find/create → peers → Jira stage updates + GitHub PR
```

## Entry point (now): playground / CLI

Slack is **deferred**. Use the local Grok Bot surface:

```bash
cd factory
./scripts/setup-factory.sh --jira-project YOURKEY   # once
# Connect Atlassian + GitHub MCP in the Cursor dashboard, then:
./scripts/serve-factory.sh
```

- Playground: http://127.0.0.1:3000/orchestrator/playground
- Describe example: `I want SqlLab to show a read-only factory stage badge for the open ticket.`
- Or with a key: `ASF-12: add the factory stage badge to SqlLab.`

One-shot:

```bash
./scripts/chat-grok-bot.sh run 'I want a factory status panel in SqlLab settings.'
```

## Jira

Set `FACTORY_JIRA_PROJECT` in `.env.factory`. Create labels listed in [docs/config-checklist.md](docs/config-checklist.md). Stages move on the **same** Jira issue as the factory progresses.

## Peers

| Slug | Role |
| --- | --- |
| `orchestrator` | Grok Bot / Jira intake + routing |
| `product` | PRD + backlog (Jira) |
| `design` | UX draft |
| `architect` | Architecture |
| `implementer` | Code + GitHub PR; sets `pr_review` on Jira |
| `reviewer` | Review packet on Jira (no label writes) |

## Docs

- [config-checklist.md](docs/config-checklist.md)
- [smoke-e2e.md](docs/smoke-e2e.md)
- [deploy-slugs.md](docs/deploy-slugs.md)
- [slack-grok-bot.md](docs/slack-grok-bot.md) (paused)

## Verify

```bash
npm run validate
npm run check
npm test --workspace=@superset-factory/core
npx @grok/agent-sdk@0.6.0 tool call start_factory_ticket \
  --dir ./agents --slug orchestrator \
  --input '{"description":"Add a SqlLab factory status badge"}' --json
```
