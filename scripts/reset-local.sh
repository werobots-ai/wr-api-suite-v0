#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.dev.yml"
DATA_DIR="$ROOT_DIR/data"
BACKEND_DATA_DIR="$ROOT_DIR/backend/data"

if [[ -f "$COMPOSE_FILE" ]]; then
  if command -v docker >/dev/null 2>&1; then
    if docker compose version >/dev/null 2>&1; then
      docker compose -f "$COMPOSE_FILE" down --remove-orphans >/dev/null 2>&1 || true
    elif command -v docker-compose >/dev/null 2>&1; then
      docker-compose -f "$COMPOSE_FILE" down --remove-orphans >/dev/null 2>&1 || true
    fi
  fi
fi

rm -rf "$DATA_DIR/keycloak" "$DATA_DIR/dynamodb"
rm -f "$DATA_DIR/identity.json"
rm -rf "$BACKEND_DATA_DIR"

if [[ -d "$DATA_DIR" ]]; then
  find "$DATA_DIR" -type d -empty -delete 2>/dev/null || true
fi

printf "Local Keycloak and DynamoDB state cleared.\n"
