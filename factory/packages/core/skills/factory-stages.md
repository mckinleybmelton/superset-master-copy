# Factory stages

Ticket SoT is **Jira**. Use `@superset-factory/core` tools (`get_stage`, `assert_stage`, `apply_stage`, `route_for_stage`) before any specialist ask or label write. Apply planned label remove/add via **Atlassian/Jira** MCP.

## Rules

1. Exactly one factory stage label on the Jira issue (plus optional `factory` marker).
2. Verify stage before asking a peer (`assert_stage` / `route_for_stage`).
3. At `*_review` or `done`, stop for a human — do not ask specialists.
4. Plan label changes with `apply_stage` (ownership + `pr_review` requires `prExists: true`), then apply via Jira MCP.
5. Reviewer never writes stage labels. Implementer sets `pr_review` only after a GitHub PR URL exists.
6. Orchestrator may set `prd_draft` only at intake (find/create Jira task).
