# Superset software factory

In-repo multi-agent factory for an AI-first Superset workflow.

**Grok Bot** is the **orchestrator** peer (Grok 4.7 via `@grok/agent-sdk`). It is the only entry point humans talk to. It routes work through specialist peers: product → design → architect → implementer → reviewer. Tickets and PRs live on this GitHub fork.

```text
You → Grok Bot (orchestrator) → peers → GitHub Issues + PRs
```

## Entry point (now): playground / CLI

Slack is **deferred** (needs a Cursor team to mint the Socket Mode app). Use the local Grok Bot surface instead:

```bash
cd factory
./scripts/setup-factory.sh   # once
./scripts/serve-factory.sh
```

Then open:

- Playground: http://127.0.0.1:3000/orchestrator/playground
- Host index: http://127.0.0.1:3000/

Or one-shot from another terminal (with the same Cursor login):

```bash
cd factory
npx --yes @grok/agent-sdk@0.6.0 run --dir ./agents --slug orchestrator \
  --message 'Route issue #12 (prd_draft): add a factory status panel to SqlLab.'
```

Interactive REPL against a running serve:

```bash
npx --yes @grok/agent-sdk@0.6.0 chat --url http://127.0.0.1:3000/orchestrator
```

## Slack (later)

When you have a Cursor team:

```bash
./scripts/slack-create-grok-bot.sh
# then --team <id> if prompted
```

See [docs/slack-grok-bot.md](docs/slack-grok-bot.md). Until then, Slack channel code may idle without tokens — that is expected.

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
- [slack-grok-bot.md](docs/slack-grok-bot.md) (paused)

## Verify

```bash
npm run validate
npm run check
npm test --workspace=@superset-factory/core
npx @grok/agent-sdk@0.6.0 tool call factoryCore__route_for_stage \
  --dir ./agents --slug orchestrator --input '{"stage":"prd_draft"}' --json
```
