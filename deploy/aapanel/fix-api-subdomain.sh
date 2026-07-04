#!/bin/bash
grep -q $'\r' "$0" 2>/dev/null && sed -i 's/\r$//' "$0" && exec bash "$0" "$@"

# Corrige conexão do frontend → api.seudominio.com.br
# (Nginx proxy SSL, CORS, rebuild frontend + backend)
#
# Uso:
#   cd /home/deploy/sorelle-presentes
#   bash deploy/aapanel/fix-api-subdomain.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_ENV="${SCRIPT_DIR}/.env.deploy"

# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

load_deploy_env "$DEPLOY_ENV"
cd "$APP_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
ok() { echo -e "${GREEN}OK${NC}  $*"; }
fail() { echo -e "${RED}FALHA${NC} $*"; }
warn() { echo -e "${YELLOW}AVISO${NC} $*"; }

API_URL="$(vite_api_url)"
API_PUBLIC="$(site_public_url "${API_DOMAIN:-api.${DOMAIN}}")"

echo "==> Domínio loja:  $(site_public_url)"
echo "==> Domínio API:   ${API_PUBLIC}"
echo "==> URL no front:  ${API_URL}"
echo ""

echo "1) Backend local..."
if curl -sf http://127.0.0.1:3001/api/health >/dev/null; then
  ok "127.0.0.1:3001/api/health"
else
  fail "Backend não responde — docker compose -f deploy/docker/docker-compose.backend.yml up -d --build"
  exit 1
fi

echo ""
echo "2) API HTTPS (${API_PUBLIC}/api/health)..."
CODE=$(curl -skL -o /tmp/sorelle-api-health.json -w "%{http_code}" "${API_PUBLIC}/api/health" || echo "000")
if [ "$CODE" = "200" ] && grep -q '"status"' /tmp/sorelle-api-health.json 2>/dev/null; then
  ok "HTTP ${CODE} — $(cat /tmp/sorelle-api-health.json)"
else
  fail "HTTP ${CODE} em ${API_PUBLIC}/api/health"
  echo "   → aaPanel: Website → ${API_DOMAIN} → SSL (Let's Encrypt)"
  echo "   → bash deploy/docker/patch-nginx-docker.sh"
  exit 1
fi

echo ""
echo "3) CORS (server/.env)..."
update_server_env_urls || true
docker compose -f deploy/docker/docker-compose.backend.yml restart backend 2>/dev/null || true
sleep 3
ok "CORS_ORIGIN=$(grep '^CORS_ORIGIN=' server/.env | cut -d= -f2-)"

echo ""
echo "4) Nginx subdomínio API..."
write_nginx_api_vhost || true
patch_nginx_api_subdomain_proxy || true
reload_nginx || true

echo ""
echo "5) Frontend (sorelle-config.js)..."
export VITE_API_URL="${API_URL}"
docker compose -f deploy/docker/docker-compose.frontend.yml up -d --build --force-recreate

echo ""
echo "6) Preflight CORS (simula browser)..."
PREFLIGHT=$(curl -sk -o /tmp/sorelle-preflight.txt -w "%{http_code}" -X OPTIONS \
  "${API_PUBLIC}/api/auth/login" \
  -H "Origin: $(site_public_url)" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type" || echo "000")
if [ "$PREFLIGHT" = "204" ] || [ "$PREFLIGHT" = "200" ]; then
  ok "OPTIONS → HTTP ${PREFLIGHT}"
else
  warn "OPTIONS → HTTP ${PREFLIGHT} (pode bloquear login no navegador)"
fi

echo ""
echo -e "${GREEN}Concluído.${NC} Teste login em $(site_public_url)/"
echo "No navegador (F12): window.__SORELLE_API_URL__  →  ${API_URL}"
