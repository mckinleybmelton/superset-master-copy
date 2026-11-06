import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { planApplyStage } from "@superset-factory/core";

/**
 * Gate: refuse pr_review unless a PR URL is supplied.
 */
export default defineTool({
  description:
    "Plan moving an issue to pr_review only when a pull request URL is present. Use before applying labels.",
  effect: "idempotent",
  inputSchema: z.object({
    labels: z.array(z.string()),
    prUrl: z.string().url().optional(),
  }),
  async execute({ labels, prUrl }) {
    if (!prUrl) {
      return {
        ok: false as const,
        error: "Abort: pr_review requires an existing pull request URL",
      };
    }
    const plan = planApplyStage({
      labels,
      nextStage: "pr_review",
      actor: "implementer",
      prExists: true,
    });
    return { ...plan, prUrl };
  },
});
