#!/bin/bash
grep -q $'\r' "$0" 2>/dev/null && sed -i 's/\r$//' "$0" && exec bash "$0" "$@"

# Publica a loja React em /home/deploy/sorelle-presentes/dist
#
# Caminhos padrão:
#   APP_DIR   = /home/deploy/sorelle-presentes
#   SITE_ROOT = /home/deploy/sorelle-presentes/dist
#   DOMAIN    = sorellepresentes.com.br
#
# Uso (na VPS, como root):
#   cd /home/deploy/sorelle-presentes
#   bash deploy/aapanel/fix-homepage.sh
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
fail() { echo -e "${RED}ERRO:${NC} $*" >&2; exit 1; }

load_deploy_env "$DEPLOY_ENV"

echo ""
echo "=============================================================================="
echo " Sorelle — publicar página inicial"
echo "=============================================================================="
print_deploy_paths
echo "=============================================================================="
echo ""

[ -d "$APP_DIR" ] || fail "Projeto não encontrado: $APP_DIR"
[ -f "${APP_DIR}/package.json" ] || fail "package.json não encontrado em $APP_DIR"

# shellcheck source=npm-install.sh
source "${SCRIPT_DIR}/npm-install.sh"

cd "$APP_DIR"

if [ -d .git ]; then
  log "Atualizando código..."
  git pull origin "${GIT_BRANCH}" || git pull || true
fi

log "Build do frontend..."
npm_ci_safe .
export VITE_API_URL="$(vite_api_url)"
log "VITE_API_URL=${VITE_API_URL}"
npm run build

[ -d dist ] || fail "Build falhou — pasta dist/ não encontrada"

publish_frontend "${APP_DIR}/dist" "$SITE_ROOT" || fail "Falha ao publicar em ${SITE_ROOT}"

write_nginx_vhost || fail "Falha ao escrever ${AAPANEL_VHOST}"
write_nginx_api_vhost || warn "Falha ao escrever vhost da API"
update_server_env_urls || true
reload_nginx || true

PUBLIC_URL="$(site_public_url)"

echo ""
echo "=============================================================================="
echo -e "${GREEN}Loja publicada com sucesso!${NC}"
echo ""
echo "  URL:        ${PUBLIC_URL}/"
echo "  Site root:  ${SITE_ROOT}"
echo "  Nginx:      ${AAPANEL_VHOST}"
echo ""
echo "No aaPanel: Website → ${SITE_NAME} → raiz = ${SITE_ROOT}"
echo "No navegador: Ctrl+F5 em ${PUBLIC_URL}/"
echo "=============================================================================="
