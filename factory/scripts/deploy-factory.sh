#!/usr/bin/env bash
# Dry-run by default. Pass --apply only after reviewing dry-run output.
# First real deploy must be run by a human so the one-time alias token is saved.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

APPLY=0
if [[ "${1:-}" == "--apply" ]]; then
  APPLY=1
fi

if ! npx --yes @grok/agent-sdk@0.6.0 whoami --json >/dev/null 2>&1; then
  echo "Not signed in to Cursor. Run: npx @grok/agent-sdk@0.6.0 login" >&2
  echo "Deploy dry-run/--apply requires a Cursor credential. Docs: docs/deploy-slugs.md" >&2
  exit 5
fi

for dir in agents/*/; do
  slug="$(basename "$dir")"
  echo "=== $slug ==="
  if [[ "$APPLY" -eq 0 ]]; then
    npx --yes @grok/agent-sdk@0.6.0 deploy --dir "$dir" --dry-run --json
  else
    echo "Deploying $slug — ensure you capture the alias token if printed."
    npx --yes @grok/agent-sdk@0.6.0 deploy --dir "$dir" --slug "$slug"
  fi
done


if [[ "$APPLY" -eq 0 ]]; then
  echo
  echo "Dry-run only. Re-run with --apply from your terminal after approval."
  echo "Prod Slack: cd agents/orchestrator && npx @grok/agent-sdk@0.6.0 slack create --dir . --env prod --name \"Superset Factory\""
fi
