import { defineEval } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["smoke"],
  description: "Reviewer validates a review packet contract.",
  async test(t) {
    await t.send(
      'Validate review_packet_contract with prUrl "https://github.com/mckinleybmelton/superset-master-copy/pull/1", matches ["meets PRD"], gaps [], ciStatus "success", recommendation "approve". Do not change labels.',
    );
    t.succeeded();
    t.calledTool("review_packet_contract");
  },
});
