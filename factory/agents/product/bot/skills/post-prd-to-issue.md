# post-prd-to-issue

1. Assert current stage is `prd_draft` (`factoryCore__assert_stage`).
2. Comment the PRD on the GitHub issue (GitHub MCP).
3. Plan labels with `factoryCore__apply_stage` (`nextStage: prd_review`, `actor: product`).
4. Apply remove/add labels via GitHub MCP.
5. Return issue URL, comment URL if any, and new stage.
