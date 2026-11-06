import { slackChannel } from "@grok/agent-sdk/channels/slack";

/**
 * Grok Bot — Slack Socket Mode front door for the factory orchestrator.
 * Mint tokens with: npx @grok/agent-sdk@0.6.0 slack create --dir . --name "Superset Factory"
 */
export default slackChannel({
  envPrefix: "ORCHESTRATOR",
  suggestedPrompts: [
    {
      title: "Route ticket",
      message:
        "Route issue #12 (prd_draft): add a factory status panel to SqlLab.",
    },
    {
      title: "Approve gate",
      message: "Approve prd_review for issue #12 and advance the factory.",
    },
    {
      title: "Reject gate",
      message:
        "Reject design_review for issue #12 — need clearer empty states.",
    },
    {
      title: "Status",
      message: "What is the factory status of issue #12?",
    },
  ],
});
