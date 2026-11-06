import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { assertStage, FACTORY_STAGES } from "../stages.ts";

export default defineTool({
  description:
    "Assert the issue is in an expected factory stage before asking a specialist or writing an artifact.",
  effect: "read",
  inputSchema: z.object({
    labels: z.array(z.string()),
    expected: z.enum(FACTORY_STAGES),
  }),
  async execute({ labels, expected }) {
    return assertStage(labels, expected);
  },
});
