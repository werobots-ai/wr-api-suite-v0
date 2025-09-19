#!/usr/bin/env bash
set -euo pipefail

export KEYCLOAK_ENABLED="${KEYCLOAK_ENABLED:-0}"
output=$(npm test --prefix backend "$@" 2>&1)
status=$?
printf '%s\n' "$output"
if [ $status -ne 0 ]; then
  exit $status
fi

line_pct=$(echo "$output" | grep 'all files' | awk -F'|' '{print $2}' | tr -d ' ')
line_pct_int=${line_pct%.*}
if [ "$line_pct_int" -lt 80 ]; then
  echo "Line coverage ${line_pct} below threshold 80%"
  exit 1
fi

