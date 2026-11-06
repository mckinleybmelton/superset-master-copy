import { defineTool } from "@grok/agent-sdk/tools";
import { readJiraFactoryConfig } from "@superset-factory/core/jiraConfig";

export default defineTool({
  description:
    "Return configured Jira project key and factory marker label for ticket SoT.",
  effect: "read",
  async execute() {
    return readJiraFactoryConfig();
  },
});
