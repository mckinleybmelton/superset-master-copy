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
    echo "Describe a change; Grok Bot will find/create Jira and route the factory."
    echo
    exec "$ROOT/scripts/serve-factory.sh"
    ;;
  run)
    MSG="${*:-I want SqlLab to show a read-only factory stage badge for the open ticket.}"
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
