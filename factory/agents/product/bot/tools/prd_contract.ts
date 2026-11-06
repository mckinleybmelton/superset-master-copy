import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";

/** Validate a PRD payload shape before posting to GitHub. */
export default defineTool({
  description: "Validate a structured PRD against the factory contract.",
  effect: "read",
  inputSchema: z.object({
    problem: z.string().min(1),
    goals: z.array(z.string()).min(1),
    nonGoals: z.array(z.string()).default([]),
    userStories: z.array(z.string()).min(1),
    requirements: z.array(z.string()).min(1),
    successMetrics: z.array(z.string()).min(1),
    openQuestions: z.array(z.string()).default([]),
  }),
  async execute(prd) {
    return {
      ok: true,
      sections: Object.keys(prd),
      storyCount: prd.userStories.length,
    };
  },
});
