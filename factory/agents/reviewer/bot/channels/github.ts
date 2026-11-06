import {
  defaultGitHubAuth,
  githubChannel,
} from "@grok/agent-sdk/channels/github";
import { githubCursorAccount } from "../lib/githubCursorAccount.js";

export default githubChannel({
  botName: "factory-reviewer",
  cursorAccount: githubCursorAccount(),
  onPullRequest: (ctx, pr) => {
    if (pr.action === "labeled" && pr.label?.name === "factory") {
      return { auth: defaultGitHubAuth(ctx) };
    }
    if (pr.action === "ready_for_review") {
      return { auth: defaultGitHubAuth(ctx) };
    }
    return null;
  },
  onComment: (ctx, comment) => {
    const body = comment.body.trim().toLowerCase();
    if (!body.startsWith("/factory review")) {
      return null;
    }
    return { auth: defaultGitHubAuth(ctx) };
  },
});
