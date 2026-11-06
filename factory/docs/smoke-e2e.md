# Factory smoke E2E (describe → Jira → PR)

## Prerequisites

1. `cd factory && ./scripts/setup-factory.sh --jira-project YOURKEY`
2. Cursor login + **Atlassian** and **GitHub** MCP connectors
3. Jira labels created (see [config-checklist.md](config-checklist.md))
4. `./scripts/serve-factory.sh`
5. Slack optional/deferred

## Path

1. In the orchestrator playground, describe a change (optionally prefix with `PROJ-123:`).
2. Confirm Grok Bot finds or creates a Jira issue at `prd_draft`, asks **product**, then stops at `prd_review`.
3. Approve each `*_review` gate in the same chat; watch Jira labels move.
4. At `implementation`, confirm the implementer opens one GitHub PR and comments the link on Jira with `pr_review`.
5. At `pr_review`, confirm the reviewer posts a packet on Jira **without** changing labels.
6. Human merges (or rejects back to `implementation` on Jira).

## Local tool checks (no live Jira required)

```bash
cd factory
npx @grok/agent-sdk@0.6.0 tool call start_factory_ticket \
  --dir ./agents --slug orchestrator \
  --input '{"description":"Add a SqlLab factory status badge"}' --json

npx @grok/agent-sdk@0.6.0 tool call start_factory_ticket \
  --dir ./agents --slug orchestrator \
  --input '{"description":"ASF-12: continue the status badge work"}' --json

npx @grok/agent-sdk@0.6.0 tool call factoryCore__route_for_stage \
  --dir ./agents --slug orchestrator --input '{"stage":"prd_draft"}' --json
```
