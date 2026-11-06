# intake-change

Start factory work from a natural-language change description. Ticket SoT is **Jira**.

## Steps

1. Call `jira_config`. If `projectKey` is null and the user did not include a `PROJ-123` key, ask them to set `FACTORY_JIRA_PROJECT` or provide a key — still you may draft product context offline.
2. Call `start_factory_ticket` with the user description (no searchHits yet).
3. **If `mode=bind` and `jiraKey` set:** fetch the Jira issue via Atlassian MCP; read labels; `factoryCore__get_stage`. If no stage label, plan/apply `prd_draft` with `actor: orchestrator` via Jira labels. Bind and continue.
4. **If `mode=create`:**  
   a. Search Jira in `projectKey` for unresolved issues (text search on the normalized summary).  
   b. Re-call `start_factory_ticket` with `searchHits: [{key, summary}, ...]`.  
   c. If still `create`, create the Jira issue with `createPayload` (labels include `factory` + `prd_draft`).  
   d. Store the new key; put session kv via a follow-up `start_factory_ticket` bind or remember the key in your reply.
5. Call `factoryCore__route_for_stage` for `prd_draft` → ask the **product** peer with Jira key + original description. Do **not** write the PRD yourself.
6. When product posts and moves to `prd_review`, stop and ask the human to approve.

## Offline / no Atlassian

Return `createPayload` for the human to create manually, then continue product draft in-chat keyed to a placeholder until a real key exists.
