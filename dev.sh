#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

(cd "$ROOT_DIR/backend" && npm run dev) &
BACKEND_PID=$!
(cd "$ROOT_DIR/frontend" && npm run dev) &
FRONTEND_PID=$!

wait $BACKEND_PID $FRONTEND_PID
