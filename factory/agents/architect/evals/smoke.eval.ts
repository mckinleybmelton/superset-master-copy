import { defineEval } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["smoke"],
  description: "Architect drafts a component list without self-approval.",
  async test(t) {
    await t.send(
      "For issue #9 in architecture_draft, list components for a factory status API. Do not apply architecture_review.",
    );
    t.succeeded();
  },
});
