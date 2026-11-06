import { defineConnection } from "@grok/agent-sdk/connections";

function hasCursorCreds(): boolean {
  return Boolean(
    process.env.CURSOR_API_KEY ||
      process.env.CURSOR_API_KEY_FILE ||
      process.env.CURSOR_SERVICE_ACCOUNT_KEY,
  );
}

/**
 * GitHub via Cursor account MCP when signed in; otherwise a tiny local stub
 * so unsigned validate / tool-call / serve still boot.
 */
export function githubMcpConnection(options?: {
  effects?: "read";
}): ReturnType<typeof defineConnection> {
  if (hasCursorCreds()) {
    return defineConnection({
      cursorAccount: true,
      servers: ["GitHub"],
      optional: true,
      advertiseTools: true,
      ...(options?.effects ? { effects: options.effects } : {}),
    });
  }
  return defineConnection({
    tools: {
      github_sign_in_required: {
        description:
          "Placeholder until Cursor is signed in. Run agent-sdk login, then restart serve.",
        async execute() {
          return {
            ok: false,
            error:
              "GitHub MCP requires agent-sdk login (or CURSOR_API_KEY). Connect the GitHub connector in the Cursor dashboard.",
          };
        },
      },
    },
  });
}
