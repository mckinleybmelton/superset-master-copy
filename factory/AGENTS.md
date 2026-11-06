# Superset software factory

Factory conventions only. Skills load on demand — never paste skill bodies into `bot/instructions.md`.

## North star

Grok Bot (orchestrator) is the only human entry point. You describe a change; Grok Bot finds or creates a **Jira** task, routes specialist peers, and advances Jira stage labels through the SDLC. GitHub is for PRs. Slack is deferred.

## Peer slugs

| Slug | Owns |
| --- | --- |
| `orchestrator` | Jira intake + routing and gate recording (Grok Bot) |
| `product` | PRDs, backlog, draft/done stage labels on Jira |
| `design` | UX draft; sole writer of `design_review` |
| `architect` | Architecture draft; sole writer of `architecture_review` |
| `implementer` | Code + one GitHub PR; sole writer of `pr_review` (after PR exists) |
| `reviewer` | PR review packet on Jira only (no label writes) |

Specialists return to the orchestrator; they do not call each other.

## Stage labels (Jira)

Exactly one factory stage label on the Jira issue (plus optional `factory` marker):

`prd_draft` → `prd_review` → `design_draft` → `design_review` → `architecture_draft` → `architecture_review` → `implementation` → `pr_review` → `done`

## Runtime

- Node.js 22.13+ (never Bun)
- `@grok/agent-sdk@0.6.0`
- Model: `grok-4.7` on every peer
- `FACTORY_JIRA_PROJECT` required for live Jira
- `FACTORY_PRODUCT_REPO` / `FACTORY_PRODUCT_DEFAULT_BRANCH=master` for PRs

## Commands

```bash
cd factory
./scripts/setup-factory.sh --jira-project YOURKEY
./scripts/serve-factory.sh
# Playground: http://127.0.0.1:3000/orchestrator/playground
```
