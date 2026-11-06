# Factory stages

Use `@superset-factory/core` tools (`get_stage`, `assert_stage`, `apply_stage`, `route_for_stage`) before any specialist ask or label write.

## Rules

1. Exactly one factory stage label on the GitHub issue.
2. Verify stage before asking a peer (`assert_stage` / `route_for_stage`).
3. At `*_review` or `done`, stop for a human — do not ask specialists.
4. Plan label changes with `apply_stage` (ownership + `pr_review` requires `prExists: true`), then apply `remove`/`add` via GitHub MCP.
5. Reviewer never writes stage labels. Implementer sets `pr_review` only after a PR URL exists.
