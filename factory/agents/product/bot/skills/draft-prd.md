# draft-prd

Draft a PRD for the given GitHub issue.

## Output contract

Return markdown with:

1. **Problem** — who hurts and why now
2. **Goals / non-goals**
3. **User stories** — 3–7 bullets
4. **Requirements** — functional + non-functional
5. **Success metrics**
6. **Open questions**

Keep it implementable for Superset (Flask/React). Do not approve the PRD or set `prd_review` here — use `post-prd-to-issue` for that.
