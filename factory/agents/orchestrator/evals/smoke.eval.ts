import { defineEval } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["smoke"],
  description:
    "Describe-first intake plans a Jira ticket and routes toward product without self-drafting a PRD.",
  async test(t) {
    await t.send(
      'New work (no Jira key yet): "Add a read-only factory stage badge to SqlLab." Call start_factory_ticket then factoryCore__route_for_stage for prd_draft. Do not write the PRD yourself.',
    );
    t.succeeded();
    t.calledTool("start_factory_ticket");
  },
});
