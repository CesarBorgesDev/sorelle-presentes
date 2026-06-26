#!/bin/bash
grep -q $'\r' "$0" 2>/dev/null && sed -i 's/\r$//' "$0" && exec bash "$0" "$@"

# Atualiza somente o frontend (React) no aaPanel — sem rebuild Docker/API
# Uso: bash deploy/aapanel/update-frontend.sh
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
GIT_BRANCH="${GIT_BRANCH:-main}"

command -v git >/dev/null 2>&1 || fail "git não encontrado"
command -v npm >/dev/null 2>&1 || fail "npm não encontrado"
command -v rsync >/dev/null 2>&1 || fail "rsync não encontrado"

[ -d "$APP_DIR" ] || fail "Diretório não encontrado: $APP_DIR"

# shellcheck source=npm-install.sh
source "${SCRIPT_DIR}/npm-install.sh"

cd "$APP_DIR"

log "Atualizando código (branch ${GIT_BRANCH})..."
git fetch origin
git checkout "$GIT_BRANCH"
git pull origin "$GIT_BRANCH"

log "Instalando dependências e build do frontend..."
npm_ci_safe .
npm run build

[ -d dist ] || fail "Build falhou — pasta dist/ não encontrada"

publish_frontend "${APP_DIR}/dist" "$SITE_ROOT" || fail "Falha ao publicar frontend"

write_nginx_vhost || warn "Não foi possível atualizar vhost Nginx"
reload_nginx || true

PUBLIC_URL="$(site_public_url)"

echo ""
echo "=============================================================================="
echo -e "${GREEN}Frontend atualizado!${NC}"
echo ""
echo "  Site: ${PUBLIC_URL}/"
echo "  Teste: curl -I ${PUBLIC_URL}/"
echo ""
echo "Para atualizar API + banco também: bash deploy/aapanel/update-docker.sh"
echo "=============================================================================="
