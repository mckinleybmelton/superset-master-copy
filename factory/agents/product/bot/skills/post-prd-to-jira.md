# post-prd-to-jira

1. Assert current stage is `prd_draft` (`factoryCore__assert_stage` on Jira labels).
2. Comment the PRD markdown on the **Jira** issue (Atlassian MCP).
3. Plan labels with `factoryCore__apply_stage` (`nextStage: prd_review`, `actor: product`).
4. Apply remove/add **stage** labels via Jira (keep the `factory` marker label).
5. Return Jira key/URL, new stage, and ask orchestrator to stop for human approval.
