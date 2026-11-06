# post-design-to-jira

1. Assert stage `design_draft` on Jira labels.
2. Comment the design markdown on the Jira issue (Atlassian MCP).
3. `factoryCore__apply_stage` → `design_review` with `actor: design`.
4. Apply stage label remove/add via Jira (keep `factory` marker).
5. Return Jira key, links, and new stage.
