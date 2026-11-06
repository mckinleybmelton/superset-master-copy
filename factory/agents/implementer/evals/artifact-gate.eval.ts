import { defineEval } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["artifact-gate"],
  description: "Implementer refuses pr_review without a PR URL.",
  async test(t) {
    await t.send(
      'Call require_pr_before_review with labels ["implementation"] and no prUrl. Report the error.',
    );
    t.succeeded();
    t.calledTool("require_pr_before_review");
  },
});
