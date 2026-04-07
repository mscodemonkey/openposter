#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"

NODE_A_DIR="$ROOT_DIR/reference-node/data-a"
NODE_B_DIR="$ROOT_DIR/reference-node/data-b"
DIRECTORY_DIR="$ROOT_DIR/reference-node/data-directory"
INDEXER_DIR="$ROOT_DIR/indexer/data"

wait_for_health() {
  local service="$1"
  local cid=""
  local status=""

  cid="$(docker compose -f "$COMPOSE_FILE" ps -q "$service")"
  if [[ -z "$cid" ]]; then
    echo "No container found for service '$service' after restart." >&2
    exit 1
  fi

  for _ in {1..60}; do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid")"
    if [[ "$status" == "healthy" ]]; then
      return 0
    fi
    sleep 2
  done

  echo "Service '$service' did not become healthy in time (last status: $status)." >&2
  exit 1
}

echo "Stopping directory, node-a, node-b, and indexer..."
docker compose -f "$COMPOSE_FILE" stop directory node-a node-b indexer >/dev/null

echo "Removing directory, node-a, node-b, and indexer data directories..."
rm -rf "$DIRECTORY_DIR" "$NODE_A_DIR" "$NODE_B_DIR" "$INDEXER_DIR"
mkdir -p "$DIRECTORY_DIR" "$NODE_A_DIR" "$NODE_B_DIR" "$INDEXER_DIR"

echo "Starting fresh directory, node-a, node-b, and indexer containers..."
docker compose -f "$COMPOSE_FILE" up -d directory node-a node-b indexer >/dev/null

echo "Waiting for directory to become healthy..."
wait_for_health "directory"

echo "Waiting for node-a to become healthy..."
wait_for_health "node-a"

echo "Waiting for node-b to become healthy..."
wait_for_health "node-b"

echo "Waiting for indexer to become healthy..."
wait_for_health "indexer"

echo "Factory reset complete for directory, node-a, node-b, and indexer."
