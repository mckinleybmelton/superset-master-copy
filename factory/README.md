# Superset software factory

In-repo multi-agent factory for an AI-first Superset workflow.

**Grok Bot** (Slack Socket Mode on the orchestrator) listens for mentions/DMs and routes work through specialist peers: product → design → architect → implementer → reviewer. Tickets and PRs live on this GitHub fork.

```text
Slack (@Grok Bot) → orchestrator → peers → GitHub Issues + PRs
```

## Quick start

```bash
cd factory
./scripts/setup-factory.sh

# Mint the Slack Grok Bot (interactive browser; Cursor account required)
cd agents/orchestrator
npx --yes @grok/agent-sdk@0.6.0 slack create --dir . --name "Superset Factory"
npx --yes @grok/agent-sdk@0.6.0 slack doctor --prefix ORCHESTRATOR
cd ../..

./scripts/serve-factory.sh
# http://127.0.0.1:3000/orchestrator/playground
```

## Peers

| Slug | Role |
| --- | --- |
| `orchestrator` | Grok Bot / routing only |
| `product` | PRD + backlog |
| `design` | UX draft |
| `architect` | Architecture |
| `implementer` | Code + one PR |
| `reviewer` | Review packet (no label writes) |

Stage labels: `prd_draft` → `prd_review` → `design_draft` → `design_review` → `architecture_draft` → `architecture_review` → `implementation` → `pr_review` → `done`

## Docs

- [config-checklist.md](docs/config-checklist.md)
- [smoke-e2e.md](docs/smoke-e2e.md)
- [deploy-slugs.md](docs/deploy-slugs.md)

## Verify (no API key)

```bash
npm run validate
npm run check
npm test --workspace=@superset-factory/core
npx @grok/agent-sdk@0.6.0 tool call factoryCore__route_for_stage \
  --dir ./agents --slug orchestrator --input '{"stage":"prd_draft"}' --json
```

Model turns / evals need `agent-sdk login` or `CURSOR_API_KEY`.
