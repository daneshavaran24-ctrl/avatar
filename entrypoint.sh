#!/bin/sh
set -e

echo "[ravi] node=$(node -v) cwd=$(pwd)"
echo "[ravi] HOST=$HOST NITRO_HOST=$NITRO_HOST PORT=$PORT NITRO_PORT=$NITRO_PORT NODE_ENV=$NODE_ENV"

if [ ! -f .output/server/index.mjs ]; then
  echo "[ravi] FATAL: .output/server/index.mjs not found!"
  ls -la .output/server/ 2>/dev/null || echo "[ravi] .output/server/ does not exist"
  exit 1
fi

echo "[ravi] starting server..."
exec node --unhandled-rejections=throw .output/server/index.mjs
