import { defineExtension } from "@grok/agent-sdk/extensions";

export default defineExtension({
  root: import.meta.dirname,
  description:
    "Factory stage labels, ownership rules, and verify-before-ask routing helpers.",
});
