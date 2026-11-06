import { defineTool } from "@grok/agent-sdk/tools";
import { readProductRepoConfig } from "../lib/productRepo.js";

export default defineTool({
  description:
    "Return the configured product repository, default branch, and optional local path for implementation worktrees.",
  effect: "read",
  async execute() {
    return readProductRepoConfig();
  },
});
