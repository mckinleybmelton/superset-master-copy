const PRODUCT_REPO =
  process.env.FACTORY_PRODUCT_REPO ?? "mckinleybmelton/superset-master-copy";

/**
 * cursorAccount enables serve --cursor-events and requires a Cursor login.
 * Keep it off for unsigned local validate/tool-call; enable when signed in
 * or when FACTORY_GITHUB_CURSOR_EVENTS=1 (hosted/prod).
 */
export function githubCursorAccount():
  | { repos: string[]; permissions: "pr-write" }
  | undefined {
  const enabled =
    process.env.FACTORY_GITHUB_CURSOR_EVENTS === "1" ||
    Boolean(process.env.CURSOR_API_KEY) ||
    Boolean(process.env.CURSOR_API_KEY_FILE) ||
    Boolean(process.env.CURSOR_SERVICE_ACCOUNT_KEY);
  if (!enabled) {
    return undefined;
  }
  return { repos: [PRODUCT_REPO], permissions: "pr-write" };
}

export { PRODUCT_REPO };
