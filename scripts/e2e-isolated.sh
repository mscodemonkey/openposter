#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-openposter-e2e}"
export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.e2e.yml}"
export OPENPOSTER_E2E_ISOLATED="true"

export OPENPOSTER_WEB_BASE_URL="${OPENPOSTER_WEB_BASE_URL:-http://localhost:3400}"
export OPENPOSTER_DIAG_BASE_URL="${OPENPOSTER_DIAG_BASE_URL:-http://localhost:3401}"
export OPENPOSTER_WEB_B_BASE_URL="${OPENPOSTER_WEB_B_BASE_URL:-http://localhost:3402}"
export OPENPOSTER_TEST_NODE_URL="${OPENPOSTER_TEST_NODE_URL:-http://localhost:8481}"
export OPENPOSTER_TEST_NODE_B_URL="${OPENPOSTER_TEST_NODE_B_URL:-http://localhost:8482}"
export OPENPOSTER_TEST_DIRECTORY_URL="${OPENPOSTER_TEST_DIRECTORY_URL:-http://localhost:8484}"
export OPENPOSTER_DIRECTORY_URL="${OPENPOSTER_DIRECTORY_URL:-http://localhost:8484/v1/health}"
export OPENPOSTER_NODE_A_URL="${OPENPOSTER_NODE_A_URL:-http://localhost:8481/v1/health}"
export OPENPOSTER_NODE_B_URL="${OPENPOSTER_NODE_B_URL:-http://localhost:8482/v1/health}"
export OPENPOSTER_INDEXER_BASE_URL="${OPENPOSTER_INDEXER_BASE_URL:-http://localhost:8490}"
export OPENPOSTER_INDEXER_URL="${OPENPOSTER_INDEXER_URL:-http://localhost:8490/v1/health}"
export OPENPOSTER_ISSUER_BASE_URL="${OPENPOSTER_ISSUER_BASE_URL:-http://localhost:8485}"
export OPENPOSTER_ISSUER_URL="${OPENPOSTER_ISSUER_URL:-http://localhost:8485/v1/health}"
export OPENPOSTER_TEST_PLEX_URL="${OPENPOSTER_TEST_PLEX_URL:-http://localhost:32411}"

cleanup() {
  docker compose down -v --remove-orphans || true
}

trap cleanup EXIT

docker compose up -d --build
npx playwright test "$@"
