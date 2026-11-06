import { defineConnection } from "@grok/agent-sdk/connections";

export default defineConnection({
  agent: "product",
  description: "Factory product peer — PRDs, backlog, draft/done stage labels.",
});
