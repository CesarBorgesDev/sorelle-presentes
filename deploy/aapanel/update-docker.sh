#!/bin/bash
grep -q $'\r' "$0" 2>/dev/null && sed -i 's/\r$//' "$0" && exec bash "$0" "$@"

# Atualização — Docker (API + DB) + frontend no aaPanel
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_ENV="${SCRIPT_DIR}/.env.deploy"

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

echo "==> Atualizando código..."
git pull

echo "==> Build frontend..."
npm_ci_safe .
npm run build

echo "==> Publicando frontend..."
mkdir -p "$SITE_ROOT"
rsync -a --delete dist/ "$SITE_ROOT/"
chown -R www:www "$SITE_ROOT" 2>/dev/null || true

echo "==> Rebuild containers..."
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
docker compose -f deploy/aapanel/docker-compose.backend.yml up -d --build

echo "==> Migrando banco..."
docker exec sorelle-backend npm run db:migrate

echo "==> Deploy concluído."
echo "    curl -s http://127.0.0.1:3001/api/health"
