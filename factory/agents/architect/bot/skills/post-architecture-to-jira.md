# post-architecture-to-jira

1. Assert stage `architecture_draft` on Jira labels.
2. Comment architecture on the Jira issue (Atlassian MCP).
3. `factoryCore__apply_stage` → `architecture_review` with `actor: architect`.
4. Apply stage label remove/add via Jira (keep `factory` marker).
5. Return Jira key, links, and new stage.
