import { defineConnection } from "@grok/agent-sdk/connections";

function hasCursorCreds(): boolean {
  return Boolean(
    process.env.CURSOR_API_KEY ||
      process.env.CURSOR_API_KEY_FILE ||
      process.env.CURSOR_SERVICE_ACCOUNT_KEY,
  );
}

/**
 * Atlassian (Jira) via Cursor account MCP when signed in; stub otherwise
 * so unsigned validate / tool-call / serve still boot.
 */
export function atlassianMcpConnection(options?: {
  effects?: "read";
}): ReturnType<typeof defineConnection> {
  if (hasCursorCreds()) {
    return defineConnection({
      cursorAccount: true,
      servers: ["Atlassian"],
      optional: true,
      advertiseTools: true,
      ...(options?.effects ? { effects: options.effects } : {}),
    });
  }
  return defineConnection({
    tools: {
      atlassian_sign_in_required: {
        description:
          "Placeholder until Cursor is signed in. Run agent-sdk login and connect Atlassian MCP.",
        async execute() {
          return {
            ok: false,
            error:
              "Atlassian/Jira MCP requires agent-sdk login (or CURSOR_API_KEY) and the Atlassian connector in the Cursor dashboard.",
          };
        },
      },
    },
  });
}
