#!/bin/bash
grep -q $'\r' "$0" 2>/dev/null && sed -i 's/\r$//' "$0" && exec bash "$0" "$@"

# Atualização — Docker (API + DB) + frontend no aaPanel
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_ENV="${SCRIPT_DIR}/.env.deploy"

# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'
log() { echo -e "${GREEN}==>${NC} $*"; }

if [ -f "$DEPLOY_ENV" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$DEPLOY_ENV"
  set +a
fi

APP_DIR="${APP_DIR:-/www/server/sorelle-presentes}"
DOMAIN="${DOMAIN:-191.252.205.7}"
SITE_ROOT="${SITE_ROOT:-/www/wwwroot/${DOMAIN}}"

cd "$APP_DIR"

# shellcheck source=npm-install.sh
source "${SCRIPT_DIR}/npm-install.sh"

log "Atualizando código..."
git pull

log "Build frontend..."
npm_ci_safe .
npm run build

log "Publicando frontend..."
mkdir -p "$SITE_ROOT"
rsync -a --delete dist/ "$SITE_ROOT/"
chown -R www:www "$SITE_ROOT" 2>/dev/null || true

log "Rebuild containers..."
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
docker compose -f deploy/aapanel/docker-compose.backend.yml up -d --build

run_db_migrate "$APP_DIR"

echo ""
echo "==> Deploy concluído."
echo "    curl -s http://127.0.0.1:3001/api/health"
