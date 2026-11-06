# Superset software factory

This fork hosts an in-repo AI factory under [`factory/`](../factory/).

## Grok Bot

- Slack Socket Mode bot bound to the **orchestrator** peer
- Model: Grok 4.7 via `@grok/agent-sdk`
- Humans `@mention` this bot only; it routes to product / design / architect / implementer / reviewer

## Quick start

```bash
cd factory
./scripts/setup-factory.sh
# Mint Slack app (interactive):
cd agents/orchestrator && npx @grok/agent-sdk@0.6.0 slack create --dir . --name "Superset Factory"
cd ../..
./scripts/serve-factory.sh
```

Playground: http://127.0.0.1:3000/orchestrator/playground

Docs: [`factory/docs/smoke-e2e.md`](../factory/docs/smoke-e2e.md), [`factory/docs/config-checklist.md`](../factory/docs/config-checklist.md).
