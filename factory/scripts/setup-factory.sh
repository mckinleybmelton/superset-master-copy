#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PRODUCT_REPO="${FACTORY_PRODUCT_REPO:-mckinleybmelton/superset-master-copy}"
DEFAULT_BRANCH="${FACTORY_PRODUCT_DEFAULT_BRANCH:-master}"
DO_LOGIN=0
DO_SERVE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --product-repo) PRODUCT_REPO="$2"; shift 2 ;;
    --product-path) PRODUCT_PATH="$2"; shift 2 ;;
    --login) DO_LOGIN=1; shift ;;
    --serve) DO_SERVE=1; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

echo "Installing factory workspaces..."
npm install

ENV_FILE="$ROOT/.env.factory"
if [[ ! -f "$ENV_FILE" ]]; then
  {
    echo "FACTORY_PRODUCT_REPO=${PRODUCT_REPO}"
    echo "FACTORY_PRODUCT_DEFAULT_BRANCH=${DEFAULT_BRANCH}"
    if [[ -n "${PRODUCT_PATH:-}" ]]; then
      echo "FACTORY_PRODUCT_REPO_PATH=${PRODUCT_PATH}"
    fi
  } >"$ENV_FILE"
  echo "Wrote $ENV_FILE"
else
  echo "Keeping existing $ENV_FILE"
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

echo "Validating peers..."
npx --yes @grok/agent-sdk@0.6.0 validate --dir ./agents

if [[ "$DO_LOGIN" -eq 1 ]]; then
  echo "Run login in your own terminal: npx @grok/agent-sdk@0.6.0 login"
fi

echo
echo "Checklist:"
echo "  1. Connect GitHub in Cursor dashboard MCP connectors"
echo "  2. Mint Slack Grok Bot: cd agents/orchestrator && npx @grok/agent-sdk@0.6.0 slack create --dir . --name \"Superset Factory\""
echo "  3. Serve: ./scripts/serve-factory.sh"
echo "  4. Playground: http://127.0.0.1:3000/orchestrator/playground"
echo

if [[ "$DO_SERVE" -eq 1 ]]; then
  exec "$ROOT/scripts/serve-factory.sh"
fi
