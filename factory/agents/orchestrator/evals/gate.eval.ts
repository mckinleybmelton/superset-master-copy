import { defineEval } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["gate"],
  description:
    "At prd_review the orchestrator stops for a human gate and does not ask product to draft again.",
  async test(t) {
    await t.send(
      'Status for issue #7 with labels ["prd_review"]. Use factoryCore__route_for_stage. Do not ask the product peer to draft.',
    );
    t.succeeded();
    t.calledTool("factoryCore__route_for_stage");
  },
});
