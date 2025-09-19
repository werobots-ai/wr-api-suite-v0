#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.dev.yml"
DATA_ROOT="$ROOT_DIR/data"
KEYCLOAK_DATA_DIR="$DATA_ROOT/keycloak"
DYNAMO_DATA_DIR="$DATA_ROOT/dynamodb"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Missing docker-compose file at $COMPOSE_FILE" >&2
  exit 1
fi

if command -v docker >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_BIN=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_BIN=(docker-compose)
  else
    echo "docker compose plugin or docker-compose is required to start local infrastructure" >&2
    exit 1
  fi
else
  echo "Docker is required to start local infrastructure" >&2
  exit 1
fi

COMPOSE_CMD=("${COMPOSE_BIN[@]}" -f "$COMPOSE_FILE")
COMPOSE_STARTED=0
BACKEND_PID=""
FRONTEND_PID=""

export KEYCLOAK_BASE_URL="${KEYCLOAK_BASE_URL:-http://localhost:8080}"
export KEYCLOAK_REALM="${KEYCLOAK_REALM:-werobots-local}"
export KEYCLOAK_CLIENT_ID="${KEYCLOAK_CLIENT_ID:-wr-console}"
export KEYCLOAK_CLIENT_SECRET="${KEYCLOAK_CLIENT_SECRET:-local-dev-secret}"
export KEYCLOAK_ADMIN_USERNAME="${KEYCLOAK_ADMIN_USERNAME:-admin}"
export KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}"

cleanup() {
  set +e

  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1
    wait "$BACKEND_PID" >/dev/null 2>&1
  fi

  if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    kill "$FRONTEND_PID" >/dev/null 2>&1
    wait "$FRONTEND_PID" >/dev/null 2>&1
  fi

  if [[ "$COMPOSE_STARTED" -eq 1 ]]; then
    printf '\nStopping local infrastructure...\n'
    "${COMPOSE_CMD[@]}" down --remove-orphans >/dev/null 2>&1
  fi
}

handle_signal() {
  echo -e "\nReceived interrupt signal. Shutting down..."
  exit 1
}

trap cleanup EXIT
trap handle_signal INT TERM

mkdir -p "$KEYCLOAK_DATA_DIR" "$DYNAMO_DATA_DIR"

echo "Starting local infrastructure (DynamoDB Local, Keycloak)..."
"${COMPOSE_CMD[@]}" up -d
COMPOSE_STARTED=1

(cd "$ROOT_DIR/backend" && npm run dev) &
BACKEND_PID=$!

(cd "$ROOT_DIR/frontend" && npm run dev) &
FRONTEND_PID=$!

wait "$BACKEND_PID" "$FRONTEND_PID"
