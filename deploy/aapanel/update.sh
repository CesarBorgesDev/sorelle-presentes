#!/bin/bash
grep -q $'\r' "$0" 2>/dev/null && sed -i 's/\r$//' "$0" && exec bash "$0" "$@"

# Atualização PM2 (alternativa sem Docker)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_ENV="${SCRIPT_DIR}/.env.deploy"

# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

load_deploy_env "$DEPLOY_ENV"

cd "$APP_DIR"

echo "==> Atualizando código..."
git pull

echo "==> Dependências e build..."
npm ci
npm ci --prefix server
npm run build

if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^sorelle-backend$'; then
  echo "ERRO: Este servidor usa Docker. Use:"
  echo "  bash deploy/aapanel/update-frontend.sh"
  echo "  bash deploy/aapanel/update-docker.sh"
  exit 1
fi

echo "==> Migrando banco..."
npm run db:migrate --prefix server

echo "==> Reiniciando API..."
pm2 restart sorelle-api

if [ -d "$SITE_ROOT" ]; then
  echo "==> Publicando frontend em ${SITE_ROOT}..."
  rsync -a --delete dist/ "$SITE_ROOT/"
  chown -R www:www "$SITE_ROOT"
fi

echo "==> Deploy concluído."
