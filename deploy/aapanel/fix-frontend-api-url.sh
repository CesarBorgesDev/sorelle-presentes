#!/bin/bash
grep -q $'\r' "$0" 2>/dev/null && sed -i 's/\r$//' "$0" && exec bash "$0" "$@"

# Corrige frontend apontando para /api quando a API está em api.seudominio.com.br
#
# Uso (na VPS):
#   cd /home/deploy/sorelle-presentes
#   bash deploy/aapanel/fix-frontend-api-url.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_ENV="${SCRIPT_DIR}/.env.deploy"

# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

load_deploy_env "$DEPLOY_ENV"
cd "$APP_DIR"

export VITE_API_URL="$(vite_api_url)"

echo "==> URL da API: ${VITE_API_URL}"
echo "==> Recriando container sorelle-frontend..."

docker compose -f deploy/aapanel/docker-compose.frontend.yml up -d --build --force-recreate

echo ""
echo "Verifique no navegador (F12 → Console):"
echo "  window.__SORELLE_API_URL__"
echo "Deve ser: ${VITE_API_URL}"
echo ""
echo "Teste:"
echo "  curl -s '$(site_public_url "$API_DOMAIN")/api/health'"
