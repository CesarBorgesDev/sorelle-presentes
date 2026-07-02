#!/bin/bash
grep -q $'\r' "$0" 2>/dev/null && sed -i 's/\r$//' "$0" && exec bash "$0" "$@"

# Corrige /api/health retornando HTML do React (proxy Nginx ausente no vhost SSL)
#
# Uso (na VPS, como root):
#   cd /home/deploy/sorelle-presentes
#   bash deploy/aapanel/fix-nginx-api.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_ENV="${SCRIPT_DIR}/.env.deploy"

# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
DEPLOY_AAPANEL_DIR="$SCRIPT_DIR"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'
log() { echo -e "${GREEN}==>${NC} $*"; }
warn() { echo -e "${YELLOW}AVISO:${NC} $*"; }
fail() { echo -e "${RED}ERRO:${NC} $*" >&2; exit 1; }

load_deploy_env "$DEPLOY_ENV"

echo ""
log "Backend local:"
if curl -sf --connect-timeout 5 http://127.0.0.1:3001/api/health >/tmp/sorelle-local-health.json; then
  echo -e "  ${GREEN}OK${NC}  $(cat /tmp/sorelle-local-health.json)"
else
  echo -e "  ${RED}FALHA${NC} API não responde em 127.0.0.1:3001"
  echo "        docker compose -f deploy/aapanel/docker-compose.backend.yml up -d --build"
  fail "Suba o backend antes de configurar o Nginx."
fi

echo ""
log "Site: ${DOMAIN} | root: ${SITE_ROOT}"
log "Removendo includes inválidos de tentativas anteriores..."
patch_nginx_api_proxy || fail "Falha ao aplicar proxy /api — veja nginx -t acima"
reload_nginx || true

BASE_URL="$(site_public_url)"
WWW_URL="$(site_public_url "www.${DOMAIN}")"

test_api_url() {
  local url="$1"
  local label="$2"
  local code body

  body="$(mktemp)"
  code="$(curl -skL --connect-timeout 15 -o "$body" -w "%{http_code}" "$url" 2>/dev/null || echo "000")"
  code="${code//[^0-9]/}"
  code="${code:-000}"

  if [ "$code" = "200" ] && grep -q '"status"' "$body" 2>/dev/null; then
    echo -e "  ${GREEN}OK${NC}  ${label}: $url"
    echo "        $(tr -d '\n' < "$body" | head -c 120)"
    rm -f "$body"
    return 0
  fi

  echo -e "  ${RED}FALHA${NC} ${label}: $url → HTTP ${code}"
  if [ -s "$body" ]; then
    if grep -q 'id="root"' "$body" 2>/dev/null; then
      echo "        Resposta é HTML do React — proxy /api não está ativo neste vhost."
    else
      echo "        $(tr -d '\n' < "$body" | head -c 160)"
    fi
  fi
  rm -f "$body"
  return 1
}

echo ""
echo "Testes públicos:"
failed=0
test_api_url "${BASE_URL}/api/health" "apex" || failed=1
if ! is_ipv4 "${DOMAIN:-}"; then
  test_api_url "${WWW_URL}/api/health" "www" || failed=1
fi

echo ""
if [ "$failed" -eq 0 ]; then
  echo -e "${GREEN}Proxy /api configurado com sucesso.${NC}"
else
  echo "Se ainda falhar:"
  echo "  1. aaPanel → Website → ${SITE_NAME} → confira root = ${SITE_ROOT}"
  echo "  2. grep -r 'sorelle-presentes-api-proxy' /www/server/panel/vhost/nginx/"
  echo "  3. /www/server/nginx/sbin/nginx -t && bt reload"
  exit 1
fi
