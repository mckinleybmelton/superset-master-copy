import { slackChannel } from "@grok/agent-sdk/channels/slack";

/**
 * Grok Bot — Slack Socket Mode front door (deferred until Cursor team exists).
 * Mint tokens with: npx @grok/agent-sdk@0.6.0 slack create --dir . --name "Superset Factory"
 */
export default slackChannel({
  envPrefix: "ORCHESTRATOR",
  suggestedPrompts: [
    {
      title: "Describe a change",
      message:
        "I want SqlLab to show a read-only factory stage badge for the open Jira ticket.",
    },
    {
      title: "Continue existing ticket",
      message: "ASF-12: continue factory routing for this ticket.",
    },
    {
      title: "Approve gate",
      message: "Approve prd_review for ASF-12 and advance the factory.",
    },
    {
      title: "Status",
      message: "What is the factory status of ASF-12?",
    },
  ],
});
