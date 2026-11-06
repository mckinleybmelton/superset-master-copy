# open-pr

1. Assert stage `implementation`.
2. Open **one** PR into `FACTORY_PRODUCT_DEFAULT_BRANCH` via GitHub MCP (or `gh`).
3. Comment the PR link on the GitHub issue.
4. Call `require_pr_before_review` with the PR URL, then apply the returned label plan (`pr_review`).
5. If no PR URL exists, abort — never set `pr_review`.
6. Return PR URL and new stage. Never merge.
