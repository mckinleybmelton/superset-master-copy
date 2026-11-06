import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { FACTORY_STAGES, routePeerForStage } from "../stages.ts";

export default defineTool({
  description:
    "Orchestrator helper: given the current factory stage, return which peer to ask (or whether to stop for a human gate).",
  effect: "read",
  inputSchema: z.object({
    stage: z.enum(FACTORY_STAGES),
  }),
  async execute({ stage }) {
    return routePeerForStage(stage);
  },
});
