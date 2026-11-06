# review-pr

1. Assert stage `pr_review` on Jira labels (read-only check).
2. Load GitHub PR diff/checks and Jira artifacts (PRD + architecture comments).
3. Score matches vs gaps against requirements.
4. Validate with `review_packet_contract`.
5. Do not post yet — use `post-review-packet`.
