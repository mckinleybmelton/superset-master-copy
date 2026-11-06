import { defineConnection } from "@grok/agent-sdk/connections";

export default defineConnection({
  agent: "implementer",
  description:
    "Factory implementer peer — code + one PR; sole writer of pr_review after PR exists.",
});
