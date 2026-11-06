import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";

/**
 * Persist a human gate decision in host kv for later turns / audit.
 */
export default defineTool({
  description:
    "Record a human approve/reject decision for a factory ticket stage (orchestrator only).",
  effect: "idempotent",
  inputSchema: z.object({
    issue: z.string().describe("Issue number or URL"),
    stage: z.string(),
    decision: z.enum(["approve", "reject"]),
    notes: z.string().optional(),
  }),
  async execute(input, ctx) {
    const key = `factory:gate:${input.issue}:${input.stage}`;
    const value = {
      ...input,
      at: new Date().toISOString(),
      sessionId: ctx.session.id,
    };
    await ctx.host.kv.put(key, value);
    return { ok: true, key, value };
  },
});
