import { defineEval } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["smoke"],
  description: "Design peer drafts UX notes and does not self-approve.",
  async test(t) {
    await t.send(
      "For issue #9 in design_draft, outline a short design for a factory status panel. Do not apply design_review.",
    );
    t.succeeded();
  },
});
