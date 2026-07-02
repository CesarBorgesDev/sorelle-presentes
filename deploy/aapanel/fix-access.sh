#!/bin/bash
grep -q $'\r' "$0" 2>/dev/null && sed -i 's/\r$//' "$0" && exec bash "$0" "$@"

# Corrige acesso na porta 80 + publica loja React
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_ENV="${SCRIPT_DIR}/.env.deploy"

# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
DEPLOY_AAPANEL_DIR="$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
log()  { echo -e "${GREEN}==>${NC} $*"; }
warn() { echo -e "${YELLOW}AVISO:${NC} $*"; }

load_deploy_env "$DEPLOY_ENV"

diagnose_access

log "1/5 Liberando firewall..."
open_firewall_ports

log "2/5 Iniciando Nginx..."
ensure_nginx_running || true

log "3/6 Configurando proxy /api no Nginx (HTTP + HTTPS)..."
patch_nginx_api_proxy || warn "Falha ao aplicar patch /api"
write_nginx_vhost || warn "Falha ao escrever vhost"
write_nginx_api_vhost || warn "Falha ao escrever vhost da API"
update_server_env_urls || true
reload_nginx || true

log "4/6 Publicando frontend em ${SITE_ROOT}..."
if [ -d "${APP_DIR}/dist" ]; then
  publish_frontend "${APP_DIR}/dist" "$SITE_ROOT" || warn "dist/ inválido — rode: bash deploy/aapanel/fix-homepage.sh"
else
  warn "dist/ não encontrado — rode: bash ${APP_DIR}/deploy/aapanel/fix-homepage.sh"
fi

log "5/6 Subindo Docker..."
if [ -f "${APP_DIR}/deploy/aapanel/docker-compose.backend.yml" ]; then
  docker compose -f "${APP_DIR}/deploy/aapanel/docker-compose.backend.yml" up -d 2>/dev/null || true
fi

diagnose_access

echo ""
echo "Teste loja: curl -I $(site_public_url)/"
echo "Teste API:  curl -s $(site_public_url)/api/health"
echo "Teste www:  curl -s $(site_public_url "www.${DOMAIN}")/api/health"
echo "Site root: ${SITE_ROOT} | Nginx: ${AAPANEL_VHOST}"
