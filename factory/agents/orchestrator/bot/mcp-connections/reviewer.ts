import { defineConnection } from "@grok/agent-sdk/connections";

export default defineConnection({
  agent: "reviewer",
  description:
    "Factory reviewer peer — PR review packet only; never writes stage labels.",
});
