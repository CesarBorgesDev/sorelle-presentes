#!/bin/bash
grep -q $'\r' "$0" 2>/dev/null && sed -i 's/\r$//' "$0" && exec bash "$0" "$@"

# Sobe/repara backend Docker + diagnóstico
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DEPLOY_ENV="${APP_DIR}/deploy/aapanel/.env.deploy"
COMPOSE_FILE="${APP_DIR}/deploy/docker/docker-compose.backend.yml"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
ok() { echo -e "${GREEN}OK${NC}  $*"; }
fail() { echo -e "${RED}FALHA${NC} $*"; }
warn() { echo -e "${YELLOW}AVISO${NC} $*"; }

cd "$APP_DIR"

if [ ! -f "${APP_DIR}/server/.env" ]; then
  fail "server/.env não encontrado."
  echo "  → bash deploy/aapanel/install-docker.sh"
  echo "  → ou cp server/.env.example server/.env"
  exit 1
fi

COMPOSE_ENV=()
if [ -f "$DEPLOY_ENV" ]; then
  COMPOSE_ENV=(--env-file "$DEPLOY_ENV")
  # shellcheck disable=SC1090
  set -a && source "$DEPLOY_ENV" && set +a
  ok "Usando ${DEPLOY_ENV}"
else
  warn ".env.deploy não encontrado — export POSTGRES_PASSWORD manualmente"
fi

export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"

echo "==> Subindo backend (POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-(vazio → postgres)})..."
docker compose "${COMPOSE_ENV[@]}" -f "$COMPOSE_FILE" up -d --build

echo "==> Aguardando API..."
for i in $(seq 1 90); do
  if curl -sf http://127.0.0.1:3001/api/health 2>/dev/null | grep -q '"status"'; then
    ok "$(curl -s http://127.0.0.1:3001/api/health)"
    exit 0
  fi
  sleep 2
done

fail "Backend não respondeu em 127.0.0.1:3001"
echo ""
docker compose "${COMPOSE_ENV[@]}" -f "$COMPOSE_FILE" ps || true
echo ""
echo "--- logs sorelle-backend ---"
docker logs sorelle-backend --tail 80 2>&1 || true
echo ""
echo "--- logs sorelle-db ---"
docker logs sorelle-db --tail 30 2>&1 || true
echo ""
echo "Verifique:"
echo "  1. JWT_SECRET em server/.env (mín. 24 chars em produção)"
echo "  2. POSTGRES_PASSWORD igual em .env.deploy e no banco"
echo "  3. export POSTGRES_PASSWORD='Sorelle1975' antes do compose"
exit 1
