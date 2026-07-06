#!/bin/bash
grep -q $'\r' "$0" 2>/dev/null && sed -i 's/\r$//' "$0" && exec bash "$0" "$@"

# Sobe PostgreSQL + API (container sorelle-backend)
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

ENV_FILE="${ROOT}/deploy/aapanel/.env.deploy"
if [ -f "$ENV_FILE" ]; then
  exec docker compose --env-file "$ENV_FILE" -f deploy/docker/docker-compose.backend.yml "$@"
fi

exec docker compose -f deploy/docker/docker-compose.backend.yml "$@"
