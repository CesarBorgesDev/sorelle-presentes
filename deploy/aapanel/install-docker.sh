#!/bin/bash
grep -q $'\r' "$0" 2>/dev/null && sed -i 's/\r$//' "$0" && exec bash "$0" "$@"

# =============================================================================
# Instalação Sorelle — Docker (API + DB) + Frontend no aaPanel
# =============================================================================
# Uso:
#   cp deploy/aapanel/.env.deploy.example deploy/aapanel/.env.deploy
#   # edite .env.deploy (DOMAIN, POSTGRES_PASSWORD, etc.)
#   bash deploy/aapanel/install-docker.sh
#
# Pré-requisitos (aaPanel App Store): Nginx, Node.js 20, Docker, Git
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_ENV="${SCRIPT_DIR}/.env.deploy"

# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}==>${NC} $*"; }
warn() { echo -e "${YELLOW}AVISO:${NC} $*"; }
fail() { echo -e "${RED}ERRO:${NC} $*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Comando '$1' não encontrado. Instale pelo aaPanel → App Store."
}

urlencode() {
  VAL="$1" python3 -c "import os, urllib.parse; print(urllib.parse.quote(os.environ['VAL'], safe=''))"
}

load_deploy_env() {
  if [ -f "$DEPLOY_ENV" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$DEPLOY_ENV"
    set +a
  elif [ -f "${SCRIPT_DIR}/.env.deploy.example" ]; then
    warn ".env.deploy não encontrado — criando a partir do exemplo..."
    cp "${SCRIPT_DIR}/.env.deploy.example" "$DEPLOY_ENV"
    set -a
    # shellcheck disable=SC1090
    source "$DEPLOY_ENV"
    set +a
    warn "Edite $DEPLOY_ENV (POSTGRES_PASSWORD) se ainda estiver com valor padrão."
  else
    fail "Crie deploy/aapanel/.env.deploy com DOMAIN e POSTGRES_PASSWORD."
  fi

  DOMAIN="${DOMAIN:-191.252.205.7}"
  APP_DIR="${APP_DIR:-/www/server/sorelle-presentes}"
  SITE_ROOT="${SITE_ROOT:-/www/wwwroot/${DOMAIN}}"
  POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
  REPO_URL="${REPO_URL:-https://github.com/CesarBorgesDev/sorelle-presentes.git}"
  AAPANEL_VHOST="${AAPANEL_VHOST:-/www/server/panel/vhost/nginx/${DOMAIN}.conf}"
}

generate_server_env() {
  local encoded_pass db_url jwt_secret env_file template base_url

  if [ -z "$POSTGRES_PASSWORD" ]; then
    fail "POSTGRES_PASSWORD vazio em .env.deploy"
  fi

  encoded_pass="$(urlencode "$POSTGRES_PASSWORD")"
  db_url="postgresql://postgres:${encoded_pass}@db:5432/sorelle"
  jwt_secret="$(openssl rand -base64 48 | tr -d '/+=' | head -c 64)"
  env_file="${APP_DIR}/server/.env"
  template="${SCRIPT_DIR}/env.production.example"
  base_url="$(site_public_url)"

  if [ ! -f "$template" ]; then
    fail "Template não encontrado: $template"
  fi

  log "Gerando server/.env (URL pública: ${base_url})..."
  cp "$template" "$env_file"
  sed -i "s|DATABASE_URL=.*|DATABASE_URL=${db_url}|" "$env_file"
  sed -i "s|JWT_SECRET=.*|JWT_SECRET=${jwt_secret}|" "$env_file"
  sed -i "s|CORS_ORIGIN=.*|CORS_ORIGIN=${base_url}|" "$env_file"
  sed -i "s|FRONTEND_URL=.*|FRONTEND_URL=${base_url}|" "$env_file"
  sed -i "s|APP_PUBLIC_URL=.*|APP_PUBLIC_URL=${base_url}|" "$env_file"
}

write_nginx_vhost() {
  local template out_dir default_flag

  template="${SCRIPT_DIR}/nginx-vhost.conf.template"
  [ -f "$template" ] || fail "Template Nginx não encontrado: $template"

  default_flag="$(nginx_default_server_flag)"
  out_dir="$(dirname "$AAPANEL_VHOST")"
  mkdir -p "$out_dir" /www/wwwlogs 2>/dev/null || true

  log "Escrevendo vhost Nginx → $AAPANEL_VHOST"
  sed -e "s|{{DOMAIN}}|${DOMAIN}|g" \
      -e "s|{{SITE_ROOT}}|${SITE_ROOT}|g" \
      -e "s|{{APP_DIR}}|${APP_DIR}|g" \
      -e "s|{{NGINX_DEFAULT_SERVER}}|${default_flag}|g" \
      "$template" > "$AAPANEL_VHOST"
}

reload_nginx() {
  log "Recarregando Nginx..."
  if command -v bt >/dev/null 2>&1; then
    bt reload 2>/dev/null || true
  fi
  if [ -x /etc/init.d/nginx ]; then
    /etc/init.d/nginx reload
  elif command -v nginx >/dev/null 2>&1; then
    nginx -t && nginx -s reload
  elif [ -x /www/server/nginx/sbin/nginx ]; then
    /www/server/nginx/sbin/nginx -t && /www/server/nginx/sbin/nginx -s reload
  else
    warn "Não foi possível recarregar Nginx automaticamente. Recarregue pelo aaPanel."
  fi
}

wait_for_api() {
  local i
  log "Aguardando API em http://127.0.0.1:3001/api/health ..."
  for i in $(seq 1 30); do
    if curl -sf http://127.0.0.1:3001/api/health >/dev/null 2>&1; then
      log "API respondendo."
      return 0
    fi
    sleep 2
  done
  fail "API não respondeu a tempo. Verifique: docker logs sorelle-backend"
}

# shellcheck source=npm-install.sh
source "${SCRIPT_DIR}/npm-install.sh"

# --- main ---

load_deploy_env

require_cmd docker
require_cmd git
require_cmd node
require_cmd npm
require_cmd curl
require_cmd python3
require_cmd rsync

if ! docker compose version >/dev/null 2>&1; then
  fail "docker compose não disponível. Instale Docker pelo aaPanel."
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 18 ]; then
  fail "Node.js 18+ necessário para build do frontend."
fi

log "Domínio: $DOMAIN"
log "App: $APP_DIR"
log "Site: $SITE_ROOT"

# Código-fonte
if [ -d "${APP_DIR}/.git" ]; then
  log "Atualizando repositório..."
  git -C "$APP_DIR" pull || warn "git pull falhou — continuando com código local."
elif [ -n "$REPO_URL" ]; then
  log "Clonando repositório..."
  mkdir -p "$(dirname "$APP_DIR")"
  git clone "$REPO_URL" "$APP_DIR"
elif [ ! -f "${APP_DIR}/package.json" ]; then
  fail "Projeto não encontrado em $APP_DIR. Defina REPO_URL ou clone manualmente."
fi

cd "$APP_DIR"

if [ ! -f server/.env ]; then
  generate_server_env
else
  log "server/.env já existe — atualizando URLs e DATABASE_URL se necessário."
  if grep -q '@127.0.0.1:5432' server/.env 2>/dev/null; then
    warn "server/.env usa 127.0.0.1 — atualizando DATABASE_URL para rede Docker (db)..."
    encoded_pass="$(urlencode "$POSTGRES_PASSWORD")"
    sed -i "s|DATABASE_URL=.*|DATABASE_URL=postgresql://postgres:${encoded_pass}@db:5432/sorelle|" server/.env
  fi
  update_server_env_urls
fi

# Docker
log "Subindo PostgreSQL + API (Docker)..."
export POSTGRES_PASSWORD
docker compose -f deploy/aapanel/docker-compose.backend.yml up -d --build

wait_for_api

# Frontend
log "Instalando dependências e build do frontend..."
npm_ci_safe .
npm run build

log "Publicando frontend em $SITE_ROOT ..."
ensure_site_root
rsync -a --delete dist/ "$SITE_ROOT/"
chown -R www:www "$SITE_ROOT" 2>/dev/null || true

# Firewall
open_firewall_ports

# Nginx aaPanel
write_nginx_vhost
reload_nginx

# Reinicia API com URLs atualizadas
docker compose -f deploy/aapanel/docker-compose.backend.yml restart backend 2>/dev/null || true

echo ""
echo "=============================================================================="
echo -e "${GREEN}Instalação Docker concluída!${NC}"
echo ""
echo "Testes:"
echo "  curl -s http://127.0.0.1:3001/api/health"
echo "  curl -I $(site_public_url)/"
echo "  curl -s $(site_public_url)/api/health"
echo "  docker ps"
echo ""
echo "Acesso externo: $(site_public_url)/"
echo ""
echo "Se ainda aparecer 'Website not found' no aaPanel:"
echo "  1. Website → Add site → domínio/IP: ${DOMAIN}"
echo "  2. Security → Firewall → libere 80 e 443"
echo "  3. bash deploy/aapanel/open-firewall.sh"
echo ""
echo "Com domínio próprio, depois configure SSL no aaPanel."
echo "=============================================================================="
