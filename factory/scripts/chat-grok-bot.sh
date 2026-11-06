#!/usr/bin/env bash
# Talk to Grok Bot (orchestrator) without Slack — playground serve or one-shot run.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MODE="${1:-serve}"
shift || true

case "$MODE" in
  serve)
    echo "Starting factory peers. Open Grok Bot playground:"
    echo "  http://127.0.0.1:3000/orchestrator/playground"
    echo
    exec "$ROOT/scripts/serve-factory.sh"
    ;;
  run)
    MSG="${*:-Route issue #1 (prd_draft): describe the change.}"
    exec npx --yes @grok/agent-sdk@0.6.0 run --dir ./agents --slug orchestrator --message "$MSG"
    ;;
  chat)
    exec npx --yes @grok/agent-sdk@0.6.0 chat --url http://127.0.0.1:3000/orchestrator
    ;;
  *)
    echo "Usage: $0 serve | run <message> | chat" >&2
    exit 2
    ;;
esac
