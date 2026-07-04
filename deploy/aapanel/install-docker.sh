#!/bin/bash
grep -q $'\r' "$0" 2>/dev/null && sed -i 's/\r$//' "$0" && exec bash "$0" "$@"

# =============================================================================
# Instalação Sorelle — Docker (DB + API + Frontend React)
# =============================================================================
# Uso:
#   cp deploy/aapanel/.env.deploy.example deploy/aapanel/.env.deploy
#   # edite .env.deploy (DOMAIN, POSTGRES_PASSWORD, etc.)
#   bash deploy/aapanel/install-docker.sh
#
# Pré-requisitos (aaPanel App Store): Nginx, Docker, Git
# =============================================================================

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
fail() { echo -e "${RED}ERRO:${NC} $*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Comando '$1' não encontrado. Instale pelo aaPanel → App Store."
}

urlencode() {
  VAL="$1" python3 -c "import os, urllib.parse; print(urllib.parse.quote(os.environ['VAL'], safe=''))"
}

bootstrap_deploy_env() {
  if [ -f "$DEPLOY_ENV" ]; then
    load_deploy_env "$DEPLOY_ENV"
  elif [ -f "${SCRIPT_DIR}/.env.deploy.example" ]; then
    warn ".env.deploy não encontrado — criando a partir do exemplo..."
    cp "${SCRIPT_DIR}/.env.deploy.example" "$DEPLOY_ENV"
    load_deploy_env "$DEPLOY_ENV"
    warn "Edite $DEPLOY_ENV (POSTGRES_PASSWORD) se ainda estiver com valor padrão."
  else
    load_deploy_env ""
    fail "Crie deploy/aapanel/.env.deploy com DOMAIN e POSTGRES_PASSWORD."
  fi
}

generate_server_env() {
  local encoded_pass db_url jwt_secret env_file template frontend_url api_url

  if [ -z "$POSTGRES_PASSWORD" ]; then
    fail "POSTGRES_PASSWORD vazio em .env.deploy"
  fi

  encoded_pass="$(urlencode "$POSTGRES_PASSWORD")"
  db_url="postgresql://postgres:${encoded_pass}@127.0.0.1:5432/sorelle"
  jwt_secret="$(openssl rand -base64 48 | tr -d '/+=' | head -c 64)"
  env_file="${APP_DIR}/server/.env"
  template="${SCRIPT_DIR}/env.production.example"
  frontend_url="$(site_public_url)"
  api_url="$(api_public_url)"

  if [ ! -f "$template" ]; then
    fail "Template não encontrado: $template"
  fi

  log "Gerando server/.env (loja: ${frontend_url} | API: ${api_url})..."
  cp "$template" "$env_file"
  sed -i "s|DATABASE_URL=.*|DATABASE_URL=${db_url}|" "$env_file"
  sed -i "s|JWT_SECRET=.*|JWT_SECRET=${jwt_secret}|" "$env_file"
  sed -i "s|CORS_ORIGIN=.*|CORS_ORIGIN=${frontend_url}|" "$env_file"
  sed -i "s|FRONTEND_URL=.*|FRONTEND_URL=${frontend_url}|" "$env_file"
  sed -i "s|APP_PUBLIC_URL=.*|APP_PUBLIC_URL=${api_url}|" "$env_file"
}

wait_for_api() {
  local i
  log "Aguardando API em http://127.0.0.1:3001/api/health ..."
  for i in $(seq 1 60); do
    if curl -sf http://127.0.0.1:3001/api/health >/dev/null 2>&1; then
      log "API respondendo."
      return 0
    fi
    sleep 2
  done
  fail "API não respondeu a tempo. Verifique: docker logs sorelle-backend"
}

wait_for_frontend() {
  local i
  log "Aguardando frontend em http://127.0.0.1:3000 ..."
  for i in $(seq 1 60); do
    if curl -sf http://127.0.0.1:3000/ >/dev/null 2>&1; then
      log "Frontend respondendo."
      return 0
    fi
    sleep 2
  done
  fail "Frontend não respondeu a tempo. Verifique: docker logs sorelle-frontend"
}

configure_nginx_docker() {
  local patch_script="${APP_DIR}/deploy/docker/patch-nginx-docker.sh"
  if [ -f "$patch_script" ]; then
    log "Configurando Nginx → frontend :3000 e /api → :3001 ..."
    bash "$patch_script"
  else
    warn "patch-nginx-docker.sh não encontrado — configure Nginx manualmente."
    print_manual_nginx_hint
  fi
}

# --- main ---

bootstrap_deploy_env

log "Caminhos:"
print_deploy_paths
require_cmd git
require_cmd curl
require_cmd python3

if ! docker compose version >/dev/null 2>&1; then
  fail "docker compose não disponível. Instale Docker pelo aaPanel."
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
  if grep -q '@db:5432' server/.env 2>/dev/null; then
    warn "server/.env usa host 'db' — ajustando para 127.0.0.1 (acesso pelo host VPS)..."
    sed -i 's|@db:5432|@127.0.0.1:5432|' server/.env
  fi
  update_server_env_urls
fi

# Docker — DB + API + Frontend
log "Subindo PostgreSQL + API + Frontend (Docker)..."
export POSTGRES_PASSWORD
docker compose -f deploy/aapanel/docker-compose.backend.yml up -d --build

wait_for_api
wait_for_frontend

# Firewall + Nginx
open_firewall_ports
configure_nginx_docker

# Reinicia API com URLs atualizadas
docker compose -f deploy/aapanel/docker-compose.backend.yml restart backend 2>/dev/null || true

echo ""
echo "=============================================================================="
echo -e "${GREEN}Instalação Docker concluída!${NC}"
echo ""
echo "Testes:"
echo "  curl -s http://127.0.0.1:3001/api/health"
echo "  curl -sI http://127.0.0.1:3000/"
echo "  curl -I $(site_public_url)/"
echo "  curl -s $(site_public_url)/api/health"
echo "  docker ps"
echo ""
echo "Acesso externo: $(site_public_url)/"
echo ""
echo "Frontend Docker: 127.0.0.1:3000 | Backend Docker: 127.0.0.1:3001"
echo ""
echo "Se ainda aparecer 'Website not found' no aaPanel:"
echo "  1. Website → Add site → domínio/IP: ${DOMAIN}"
echo "  2. Security → Firewall → libere 80 e 443"
echo "  3. bash deploy/aapanel/open-firewall.sh"
echo ""
echo "Com domínio próprio, depois configure SSL no aaPanel."
echo "=============================================================================="
