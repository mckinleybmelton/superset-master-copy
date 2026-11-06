import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";

export default defineTool({
  description: "Validate a PR review packet before posting to the issue.",
  effect: "read",
  inputSchema: z.object({
    prUrl: z.string().url(),
    matches: z.array(z.string()).min(1),
    gaps: z.array(z.string()),
    ciStatus: z.string(),
    recommendation: z.enum(["approve", "changes_requested", "comment"]),
  }),
  async execute(packet) {
    return { ok: true, recommendation: packet.recommendation };
  },
});
