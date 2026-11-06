#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env.factory" ]]; then
  # shellcheck disable=SC1091
  set -a
  source "$ROOT/.env.factory"
  set +a
fi

# Load Slack tokens from orchestrator .env.local when present
if [[ -f "$ROOT/agents/orchestrator/.env.local" ]]; then
  # shellcheck disable=SC1091
  set -a
  source "$ROOT/agents/orchestrator/.env.local"
  set +a
fi

exec npx --yes @grok/agent-sdk@0.6.0 serve --dir ./agents --dev
