#!/bin/bash
grep -q $'\r' "$0" 2>/dev/null && sed -i 's/\r$//' "$0" && exec bash "$0" "$@"

# Atualização rápida após git pull (rodar no servidor dentro do projeto)
set -euo pipefail

APP_DIR="${APP_DIR:-/www/server/sorelle-presentes}"
DOMAIN="${DOMAIN:-}"

cd "$APP_DIR"

echo "==> Atualizando código..."
git pull

echo "==> Dependências e build..."
npm ci
npm ci --prefix server
npm run build

if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^sorelle-backend$'; then
  echo "ERRO: Este servidor usa Docker. Use:"
  echo "  bash deploy/aapanel/update-frontend.sh   # só frontend"
  echo "  bash deploy/aapanel/update-docker.sh     # frontend + API"
  exit 1
fi

echo "==> Migrando banco..."
npm run db:migrate --prefix server

echo "==> Reiniciando API..."
pm2 restart sorelle-api

if [ -n "$DOMAIN" ] && [ -d "/www/wwwroot/${DOMAIN}" ]; then
  echo "==> Publicando frontend..."
  rsync -a --delete dist/ "/www/wwwroot/${DOMAIN}/"
  chown -R www:www "/www/wwwroot/${DOMAIN}"
fi

echo "==> Deploy concluído."
