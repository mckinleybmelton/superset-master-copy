#!/usr/bin/env bash
# Interactive: opens the Cursor dashboard Slack wizard. Run from a human terminal.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/agents/orchestrator"

echo "Minting Slack Grok Bot for the orchestrator (dev env)..."
echo "Use the same Cursor account in the browser. Tokens land in .env.local."
npx --yes @grok/agent-sdk@0.6.0 slack create --dir . --name "Superset Factory"
npx --yes @grok/agent-sdk@0.6.0 slack doctor --prefix ORCHESTRATOR

echo
echo "Invite the bot to a channel, then @mention it with a factory route prompt."
echo "Prod later: npx @grok/agent-sdk@0.6.0 slack create --dir . --env prod --name \"Superset Factory\""
