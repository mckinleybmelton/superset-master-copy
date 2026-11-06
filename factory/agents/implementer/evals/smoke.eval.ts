import { defineEval } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["smoke"],
  description: "Implementer can read product repo config.",
  async test(t) {
    await t.send("Call product_repo_config and report the repo and default branch.");
    t.succeeded();
    t.calledTool("product_repo_config");
  },
});
