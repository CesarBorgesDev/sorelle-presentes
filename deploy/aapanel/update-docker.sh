#!/bin/bash
grep -q $'\r' "$0" 2>/dev/null && sed -i 's/\r$//' "$0" && exec bash "$0" "$@"

# Atualização — Docker (API + DB) + frontend no aaPanel
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

# shellcheck source=npm-install.sh
source "${SCRIPT_DIR}/npm-install.sh"

log "Atualizando código..."
git pull

log "Build frontend..."
npm_ci_safe .
export VITE_API_URL="$(vite_api_url)"
log "VITE_API_URL=${VITE_API_URL}"
npm run build

publish_frontend "${APP_DIR}/dist" "$SITE_ROOT"
write_nginx_vhost || true
write_nginx_api_vhost || true
update_server_env_urls || true
reload_nginx || true

log "Rebuild containers..."
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
docker compose -f deploy/aapanel/docker-compose.backend.yml up -d --build

run_db_migrate "$APP_DIR"

echo ""
echo "==> Deploy concluído."
echo "    Site: $(site_public_url)/"
echo "    API:  curl -s $(api_public_url)/api/health"
