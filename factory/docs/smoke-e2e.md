# Factory smoke E2E (Slack → PR)

## Prerequisites

1. `cd factory && ./scripts/setup-factory.sh`
2. Cursor login (`agent-sdk login`) + GitHub MCP connector when posting to GitHub
3. `./scripts/serve-factory.sh` (or hosted deploy slugs)
4. Slack is optional/deferred — use the orchestrator playground or `agent-sdk run` / `chat`

## Path

1. Create a GitHub issue on this fork with labels `factory` + `prd_draft`.
2. Talk to Grok Bot (orchestrator):
   - Playground: http://127.0.0.1:3000/orchestrator/playground  
   - Or: `npx @grok/agent-sdk@0.6.0 run --dir ./agents --slug orchestrator --message 'Route issue #<n> (prd_draft): <summary>'`
3. Approve each `*_review` gate in the same chat (ask the bot to advance after you accept the artifact).
4. At `implementation`, confirm the implementer opens one PR into `master`.
5. At `pr_review`, confirm the reviewer posts a review packet **without** changing labels.
6. Human merges (or rejects back to `implementation`).


## Local tool checks (no model key)

```bash
cd factory/agents/orchestrator
npx @grok/agent-sdk@0.6.0 tool call factoryCore__route_for_stage --dir . --input '{"stage":"prd_draft"}' --json
npx @grok/agent-sdk@0.6.0 tool call factoryCore__route_for_stage --dir . --input '{"stage":"prd_review"}' --json

cd ../implementer
npx @grok/agent-sdk@0.6.0 tool call require_pr_before_review --dir . --input '{"labels":["implementation"]}' --json
```
