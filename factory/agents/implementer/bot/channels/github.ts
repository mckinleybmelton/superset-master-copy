import {
  defaultGitHubAuth,
  githubChannel,
} from "@grok/agent-sdk/channels/github";
import { githubCursorAccount } from "../lib/githubCursorAccount.js";

/**
 * Optional GitHub wakes for the implementer.
 * Primary entry remains orchestrator Slack → peer ask.
 */
export default githubChannel({
  botName: "factory-implementer",
  cursorAccount: githubCursorAccount(),
  onPullRequest: (ctx, pr) => {
    if (pr.action === "labeled" && pr.label?.name === "factory") {
      return { auth: defaultGitHubAuth(ctx) };
    }
    return null;
  },
  onComment: (ctx, comment) => {
    const body = comment.body.trim().toLowerCase();
    if (!body.startsWith("/factory implement")) {
      return null;
    }
    return { auth: defaultGitHubAuth(ctx) };
  },
});
