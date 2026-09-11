#!/bin/sh
set -e

echo "[ravi] node=$(node -v) cwd=$(pwd)"
echo "[ravi] HOST=$HOST NITRO_HOST=$NITRO_HOST PORT=$PORT NITRO_PORT=$NITRO_PORT NODE_ENV=$NODE_ENV"

if [ ! -f .output/server/index.mjs ]; then
  echo "[ravi] FATAL: .output/server/index.mjs not found!"
  ls -la .output/server/ 2>/dev/null || echo "[ravi] .output/server/ does not exist"
  exit 1
fi

# Migrations run here because this entrypoint is the only start path in the
# image — scripts/start.mjs (which migrates) is not copied into the runtime
# stage. A fresh database would otherwise serve an app with no schema.
#
# A failure must not hold the server down: the avatar itself needs no database,
# and the admin panel reports missing tables in its diagnostics banner.
if [ -f scripts/migrate.mjs ]; then
  echo "[ravi] running migrations..."
  node scripts/migrate.mjs || echo "[ravi] WARNING: migrations failed — starting anyway; check the admin diagnostics banner"
else
  echo "[ravi] WARNING: scripts/migrate.mjs missing — skipping migrations"
fi

echo "[ravi] starting server..."
exec node --unhandled-rejections=throw .output/server/index.mjs
