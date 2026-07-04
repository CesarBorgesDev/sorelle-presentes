#!/bin/bash
grep -q $'\r' "$0" 2>/dev/null && sed -i 's/\r$//' "$0" && exec bash "$0" "$@"

# Atualização — Docker (DB + API + Frontend React)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_ENV="${SCRIPT_DIR}/.env.deploy"

# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
DEPLOY_AAPANEL_DIR="$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'
log() { echo -e "${GREEN}==>${NC} $*"; }

load_deploy_env "$DEPLOY_ENV"

cd "$APP_DIR"

log "Atualizando código..."
git pull

update_server_env_urls || true

log "Rebuild backend + banco..."
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
docker compose -f deploy/aapanel/docker-compose.backend.yml up -d --build

run_db_migrate "$APP_DIR"

log "Rebuild frontend (container separado)..."
docker compose -f deploy/aapanel/docker-compose.frontend.yml up -d --build

if [ -f "${APP_DIR}/deploy/docker/patch-nginx-docker.sh" ]; then
  log "Reconfigurando Nginx → Docker..."
  bash "${APP_DIR}/deploy/docker/patch-nginx-docker.sh"
fi

echo ""
echo "==> Deploy concluído."
echo "    Site: $(site_public_url)/"
echo "    API:  curl -s $(site_public_url)/api/health"
echo "    Local frontend: curl -sI http://127.0.0.1:3000/"
