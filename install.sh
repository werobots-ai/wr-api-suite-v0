#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

(cd "$ROOT_DIR/backend" && npm ci)
(cd "$ROOT_DIR/frontend" && npm ci)
