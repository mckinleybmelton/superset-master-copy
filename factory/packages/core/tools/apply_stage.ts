import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { FACTORY_STAGES, planApplyStage } from "../stages.ts";

export default defineTool({
  description:
    "Plan a factory stage label change with ownership checks. Returns remove/add label lists for GitHub MCP to apply. Does not call GitHub itself.",
  effect: "idempotent",
  inputSchema: z.object({
    labels: z.array(z.string()),
    nextStage: z.enum(FACTORY_STAGES),
    actor: z.enum([
      "orchestrator",
      "product",
      "design",
      "architect",
      "implementer",
      "reviewer",
      "human",
    ]),
    prExists: z
      .boolean()
      .optional()
      .describe("Required true when nextStage is pr_review"),
  }),
  async execute(input) {
    return planApplyStage(input);
  },
});
