import { defineEval } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["smoke"],
  description:
    "Orchestrator routes a prd_draft ticket toward product and does not self-draft a PRD.",
  async test(t) {
    await t.send(
      'Route issue #42 with labels ["prd_draft","factory"]: add dark mode toggle. Use factoryCore tools. Do not write the PRD yourself.',
    );
    t.succeeded();
    t.calledTool("factoryCore__route_for_stage");
  },
});
