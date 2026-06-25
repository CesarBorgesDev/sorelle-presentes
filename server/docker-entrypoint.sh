#!/bin/sh
set -e

# No Docker, PostgreSQL está no serviço "db". No host (VPS), use 127.0.0.1:5432.
if [ "${DOCKER_DB_HOST:-}" = "db" ] && [ -n "${DATABASE_URL:-}" ]; then
  export DATABASE_URL=$(printf '%s' "$DATABASE_URL" | sed 's/@127.0.0.1:/@db:/')
fi

exec "$@"
