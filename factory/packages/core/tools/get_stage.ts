import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { extractStage, FACTORY_STAGES } from "../stages.ts";

export default defineTool({
  description:
    "Read the factory stage from a GitHub issue label list. Pass the issue's label names.",
  effect: "read",
  inputSchema: z.object({
    labels: z.array(z.string()).describe("Issue label names"),
  }),
  async execute({ labels }) {
    const { stage, extras } = extractStage(labels);
    return {
      stage,
      extras,
      validStages: [...FACTORY_STAGES],
      ok: stage !== null && extras.length === 0,
    };
  },
});
