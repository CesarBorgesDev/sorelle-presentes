#!/bin/bash
grep -q $'\r' "$0" 2>/dev/null && sed -i 's/\r$//' "$0" && exec bash "$0" "$@"

# Remove a página padrão do aaPanel e publica a loja React como inicial
# Uso: bash deploy/aapanel/fix-homepage.sh
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

if [ -f "$DEPLOY_ENV" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$DEPLOY_ENV"
  set +a
fi

APP_DIR="${APP_DIR:-/www/server/sorelle-presentes}"
DOMAIN="${DOMAIN:-191.252.205.7}"
SITE_ROOT="${SITE_ROOT:-/www/wwwroot/${DOMAIN}}"

[ -d "$APP_DIR" ] || fail "Projeto não encontrado: $APP_DIR"

# shellcheck source=npm-install.sh
source "${SCRIPT_DIR}/npm-install.sh"

cd "$APP_DIR"

if [ -d .git ]; then
  log "Atualizando código..."
  git pull || true
fi

if [ ! -d dist ] || ! is_react_index dist/index.html 2>/dev/null; then
  log "Gerando build do frontend..."
  npm_ci_safe .
  npm run build
fi

publish_frontend "${APP_DIR}/dist" "$SITE_ROOT" || fail "Publicação falhou"

write_nginx_vhost || fail "Falha ao configurar Nginx"
reload_nginx || true

PUBLIC_URL="$(site_public_url)"

echo ""
echo "=============================================================================="
echo -e "${GREEN}Página inicial atualizada!${NC}"
echo ""
echo "  Loja: ${PUBLIC_URL}/"
echo "  Raiz: ${SITE_ROOT}"
echo ""
echo "Se ainda aparecer a mensagem do aaPanel:"
echo "  1. aaPanel → Website → ${DOMAIN} → confira raiz: ${SITE_ROOT}"
echo "  2. Ctrl+F5 no navegador"
echo "=============================================================================="
