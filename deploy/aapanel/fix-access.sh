#!/bin/bash
grep -q $'\r' "$0" 2>/dev/null && sed -i 's/\r$//' "$0" && exec bash "$0" "$@"

# Corrige "Couldn't connect to server" na porta 80
# Uso (no servidor, como root): bash deploy/aapanel/fix-access.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
DEPLOY_AAPANEL_DIR="$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
log()  { echo -e "${GREEN}==>${NC} $*"; }
warn() { echo -e "${YELLOW}AVISO:${NC} $*"; }

DEPLOY_ENV="${SCRIPT_DIR}/.env.deploy"
if [ -f "$DEPLOY_ENV" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$DEPLOY_ENV"
  set +a
fi
DOMAIN="${DOMAIN:-191.252.205.7}"
APP_DIR="${APP_DIR:-/www/server/sorelle-presentes}"
SITE_ROOT="${SITE_ROOT:-/www/wwwroot/${DOMAIN}}"

diagnose_access

log "1/4 Liberando firewall (UFW, firewalld, iptables, aaPanel)..."
open_firewall_ports

log "2/4 Iniciando Nginx..."
ensure_nginx_running || true

if [ -d "$APP_DIR" ] && [ -f "${APP_DIR}/deploy/aapanel/nginx-vhost.conf.template" ]; then
  log "3/5 Reaplicando vhost Nginx para ${DOMAIN}..."
  DEPLOY_AAPANEL_DIR="${APP_DIR}/deploy/aapanel"
  write_nginx_vhost || true
  ensure_nginx_running || true
else
  warn "Repositório não encontrado em ${APP_DIR} — pule vhost ou rode git clone + install-docker.sh"
fi

log "4/5 Publicando loja React (substitui index padrão do aaPanel)..."
if [ -d "${APP_DIR}/dist" ]; then
  publish_frontend "${APP_DIR}/dist" "$SITE_ROOT" || warn "Build dist/ ausente — rode: bash deploy/aapanel/fix-homepage.sh"
elif [ -f "${APP_DIR}/package.json" ]; then
  warn "dist/ não encontrado — execute: bash ${APP_DIR}/deploy/aapanel/fix-homepage.sh"
fi

log "5/5 Subindo Docker (se existir)..."
if [ -f "${APP_DIR}/deploy/aapanel/docker-compose.backend.yml" ]; then
  docker compose -f "${APP_DIR}/deploy/aapanel/docker-compose.backend.yml" up -d 2>/dev/null || true
fi

diagnose_access

echo ""
echo "=============================================================================="
echo -e "${GREEN}Correção aplicada.${NC}"
echo ""
echo "Se curl local (127.0.0.1) funcionar mas externo falhar:"
echo "  → Locaweb Cloud: Rede → Endereços IP públicos → ${DOMAIN}"
echo "    → aba Firewall → Adicionar TCP porta 80 e 443 (entrada)"
echo "    → https://www.locaweb.com.br/ajuda/wiki/como-configurar-regras-de-firewall/"
echo ""
echo "Se porta 80 não estiver em LISTEN:"
echo "  → aaPanel → App Store → instale/inicie Nginx"
echo "  → bash ${APP_DIR}/deploy/aapanel/install-docker.sh"
echo ""
echo "Teste externo: curl -I http://${DOMAIN}/"
echo "=============================================================================="
