import { defineEval } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["smoke"],
  description: "Product validates a PRD contract without approving gates.",
  async test(t) {
    await t.send(
      'Validate this PRD with prd_contract: problem "users cannot see factory status", goals ["show stage"], nonGoals [], userStories ["as a dev I see stage"], requirements ["slack status"], successMetrics ["time to status < 10s"], openQuestions []. Do not set stage labels.',
    );
    t.succeeded();
    t.calledTool("prd_contract");
  },
});
