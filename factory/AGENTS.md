# Superset software factory

Factory conventions only. Skills load on demand — never paste skill bodies into `bot/instructions.md`.

## North star

Grok Bot (Slack Socket Mode on the **orchestrator**) listens for mentions/DMs and routes work through specialist peers. Humans approve every `*_review` gate. Code and tickets live in this Superset fork on GitHub.

## Peer slugs

| Slug | Owns |
| --- | --- |
| `orchestrator` | Routing and gate recording only (Slack Grok Bot) |
| `product` | PRDs, backlog, stage lookups / draft+done label applies |
| `design` | UX draft; sole writer of `design_review` |
| `architect` | Architecture draft; sole writer of `architecture_review` |
| `implementer` | Code + one PR; sole writer of `pr_review` (after PR exists) |
| `reviewer` | PR review packet comment only (no label writes) |

Specialists return to the orchestrator; they do not call each other.

## Stage labels

Exactly one factory stage label on the GitHub issue:

`prd_draft` → `prd_review` → `design_draft` → `design_review` → `architecture_draft` → `architecture_review` → `implementation` → `pr_review` → `done`

## Runtime

- Node.js 22.13+ (never Bun)
- `@grok/agent-sdk@0.6.0`
- Model: `grok-4.7` on every peer
- Product repo env: `FACTORY_PRODUCT_REPO` (default `mckinleybmelton/superset-master-copy`), `FACTORY_PRODUCT_DEFAULT_BRANCH=master`

## Commands

```bash
cd factory
./scripts/setup-factory.sh
./scripts/serve-factory.sh
# Playground: http://127.0.0.1:3000/orchestrator/playground
```
