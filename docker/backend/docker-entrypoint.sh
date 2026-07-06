#!/bin/sh
set -eu

# Monta DATABASE_URL para Docker (prioridade: POSTGRES_PASSWORD do compose)
if [ -n "${POSTGRES_PASSWORD:-}" ]; then
  export DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@db:5432/sorelle"
elif [ "${DOCKER_DB_HOST:-}" = "db" ] && [ -n "${DATABASE_URL:-}" ]; then
  export DATABASE_URL=$(printf '%s' "$DATABASE_URL" | sed -E 's/@(127\.0\.0\.1|localhost|postgres):/@db:/')
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERRO: DATABASE_URL não definida. Configure server/.env ou POSTGRES_PASSWORD." >&2
  exit 1
fi

if [ -z "${JWT_SECRET:-}" ]; then
  echo "ERRO: JWT_SECRET não definido em server/.env." >&2
  exit 1
fi

echo "[backend] Iniciando (db=$(printf '%s' "$DATABASE_URL" | sed -E 's/:[^:@]*@/:***@/'))"

exec "$@"
