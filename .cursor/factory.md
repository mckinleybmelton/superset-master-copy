# Superset software factory

This fork hosts an in-repo AI factory under [`factory/`](../factory/).

## Grok Bot (entry point)

- **Peer:** `orchestrator` (Grok 4.7 via `@grok/agent-sdk`)
- **Now:** local playground / `agent-sdk run` / `agent-sdk chat` — not Slack
- **Later:** Slack Socket Mode (paused until a Cursor team is available)
- Routes only; specialists: product / design / architect / implementer / reviewer

## Quick start

```bash
cd factory
./scripts/setup-factory.sh
./scripts/serve-factory.sh
```

- Playground: http://127.0.0.1:3000/orchestrator/playground
- Example: `Route issue #12 (prd_draft): <summary>`

Docs: [`factory/README.md`](../factory/README.md), [`factory/docs/smoke-e2e.md`](../factory/docs/smoke-e2e.md).
