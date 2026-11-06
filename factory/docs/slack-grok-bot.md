# Mint the Slack Grok Bot

> **Paused:** `slack create` requires a Cursor team. Until you have one, use the
> playground / CLI entry point in [`../README.md`](../README.md) instead.
> Channel code under `agents/orchestrator/bot/channels/slack.ts` can stay idle.

Grok Bot is the **orchestrator** Slack Socket Mode app. Humans talk only to this bot.

## Dev


```bash
cd factory
./scripts/slack-create-grok-bot.sh
# equivalent:
cd agents/orchestrator
npx --yes @grok/agent-sdk@0.6.0 login   # if needed
npx --yes @grok/agent-sdk@0.6.0 slack create --dir . --name "Superset Factory"
npx --yes @grok/agent-sdk@0.6.0 slack doctor --prefix ORCHESTRATOR
```

Tokens are written to `agents/orchestrator/.env.local` as:

- `ORCHESTRATOR_SLACK_BOT_TOKEN`
- `ORCHESTRATOR_SLACK_APP_TOKEN`

Never commit or print token values.

## Smoke

1. `./scripts/serve-factory.sh`
2. Invite **Superset Factory** to a Slack channel
3. `@Superset Factory Route issue #N (prd_draft): <summary>`
4. Expect a threaded reply with stage routing

Channel code: `agents/orchestrator/bot/channels/slack.ts`.

## Prod

After hosted deploy of the orchestrator slug:

```bash
cd factory/agents/orchestrator
npx --yes @grok/agent-sdk@0.6.0 slack create --dir . --env prod --name "Superset Factory"
```
