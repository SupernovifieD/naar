#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"
npm run build

PACK_FILE="$(npm pack --silent | tail -n 1)"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
  rm -f "$ROOT_DIR/$PACK_FILE"
}
trap cleanup EXIT

cd "$TMP_DIR"
npm init -y >/dev/null
npm install "$ROOT_DIR/$PACK_FILE" >/dev/null

VERSION_OUTPUT="$(CI=1 ./node_modules/.bin/naar --version | tr -d '\r')"
if [ -z "$VERSION_OUTPUT" ]; then
  echo "ERROR: naar --version produced empty output"
  exit 1
fi
printf 'naar --version output: %s\n' "$VERSION_OUTPUT"

SEARCH_OUTPUT="$(CI=1 ./node_modules/.bin/naar search cli --json)"
if [ -z "$SEARCH_OUTPUT" ]; then
  echo "ERROR: naar search cli --json produced empty output"
  exit 1
fi
printf '%s\n' "$SEARCH_OUTPUT" | node -e 'const fs = require("node:fs"); JSON.parse(fs.readFileSync(0, "utf8"));'
printf 'naar search cli --json bytes: %s\n' "$(printf '%s' "$SEARCH_OUTPUT" | wc -c | tr -d ' ')"
