# implement-change

1. Assert stage `implementation`.
2. Call `product_repo_config` for repo/branch/path.
3. Create a branch named `factory/<issue>-<short-slug>` from the default branch.
4. Implement the approved architecture with tests. Prefer smallest change that satisfies the PRD.
5. Do not open the PR here — use `open-pr` after commits are ready.
6. Return branch name, files touched, and test commands run/needed.
