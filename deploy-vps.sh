#!/bin/bash
grep -q $'\r' "$0" 2>/dev/null && sed -i 's/\r$//' "$0" && exec bash "$0" "$@"

# =============================================================================
# Sorelle Presentes — Deploy completo VPS (script único)
#
# Instalação inicial:
#   export POSTGRES_PASSWORD='Sorelle@1975'
#   curl -fsSL https://raw.githubusercontent.com/CesarBorgesDev/sorelle-presentes/main/deploy-vps.sh | bash
#
# Com repo já clonado:
#   export POSTGRES_PASSWORD='Sorelle@1975'
#   bash /home/deploy/sorelle-presentes/deploy-vps.sh
#
# Atualizar código e containers:
#   bash deploy-vps.sh --update
#
# Só corrigir proxy Nginx /api (opcional — prefira config manual):
#   bash deploy-vps.sh --nginx-only
#
# Pré-requisitos (aaPanel → App Store): Nginx, Docker, Git
# =============================================================================

set -euo pipefail

MODE="install"

usage() {
  cat <<'EOF'
Uso: deploy-vps.sh [opções]

  (sem flag)     Instalação completa: clone/pull + Docker + frontend + testes
  --update       Atualiza código, rebuild containers e republica frontend
  --nginx-only   Opcional: aplica patch automático de proxy /api no Nginx
  -h, --help     Esta ajuda

Variáveis de ambiente (instalação inicial):
  POSTGRES_PASSWORD   Obrigatório se deploy/aapanel/.env.deploy não existir
  DOMAIN              Domínio ou IP (padrão: sorellepresentes.com.br)
  APP_DIR             Pasta do projeto (padrão: /home/deploy/sorelle-presentes)
  SITE_ROOT           Root Nginx (padrão: /home/deploy/sorelle-presentes/dist)
  GIT_BRANCH          Branch git (padrão: main)
  REPO_URL            URL do repositório GitHub
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --update) MODE="update"; shift ;;
    --nginx-only) MODE="nginx-only"; shift ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Opção desconhecida: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_URL="${REPO_URL:-https://github.com/CesarBorgesDev/sorelle-presentes.git}"
GIT_BRANCH="${GIT_BRANCH:-main}"

if [ -f "${SELF_DIR}/deploy/aapanel/common.sh" ]; then
  APP_DIR="${APP_DIR:-$SELF_DIR}"
else
  APP_DIR="${APP_DIR:-/home/deploy/sorelle-presentes}"
fi

DOMAIN="${DOMAIN:-sorellepresentes.com.br}"
SITE_NAME="${SITE_NAME:-sorelle-presentes}"
SITE_ROOT="${SITE_ROOT:-/home/deploy/sorelle-presentes/dist}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}==>${NC} $*"; }
warn() { echo -e "${YELLOW}AVISO:${NC} $*"; }
fail() { echo -e "${RED}ERRO:${NC} $*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "'$1' não encontrado. Instale pelo aaPanel → App Store."
}

echo ""
echo "=============================================================================="
echo " Sorelle Presentes — Deploy VPS"
echo " Modo:    ${MODE}"
echo " Domínio: ${DOMAIN}"
echo " Repo:    ${REPO_URL} (branch ${GIT_BRANCH})"
echo " App:     ${APP_DIR}"
echo "=============================================================================="
echo ""

DEPLOY_DIR="${APP_DIR}/deploy/aapanel"

ensure_deploy_dir() {
  if [ ! -f "${DEPLOY_DIR}/common.sh" ]; then
    fail "Pasta deploy/aapanel não encontrada em ${APP_DIR}.
  Faça push dos arquivos de deploy para o GitHub (branch ${GIT_BRANCH}) e tente novamente.
  Ou use: GIT_BRANCH=sua-branch bash deploy-vps.sh"
  fi
}

fix_script_line_endings() {
  sed -i 's/\r$//' "${DEPLOY_DIR}"/*.sh 2>/dev/null || true
}

ensure_env_deploy() {
  if [ -f "${DEPLOY_DIR}/.env.deploy" ]; then
    log "Usando ${DEPLOY_DIR}/.env.deploy existente."
    return 0
  fi

  if [ -z "${POSTGRES_PASSWORD:-}" ]; then
    fail "Defina a senha do PostgreSQL: export POSTGRES_PASSWORD='SuaSenha'"
  fi

  log "Criando ${DEPLOY_DIR}/.env.deploy ..."
  cat > "${DEPLOY_DIR}/.env.deploy" << EOF
DOMAIN=${DOMAIN}
API_DOMAIN=api.${DOMAIN}
SITE_NAME=${SITE_NAME}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
APP_DIR=${APP_DIR}
SITE_ROOT=${SITE_ROOT}
REPO_URL=${REPO_URL}
VITE_API_URL=https://api.${DOMAIN}/api
EOF
}

sync_repository() {
  require_cmd git

  if [ -d "${APP_DIR}/.git" ]; then
    log "Repositório encontrado — atualizando..."
    git -C "$APP_DIR" fetch origin "$GIT_BRANCH" 2>/dev/null || true
    git -C "$APP_DIR" checkout "$GIT_BRANCH" 2>/dev/null || true
    git -C "$APP_DIR" pull origin "$GIT_BRANCH" || warn "git pull falhou — usando código local."
  elif [ -d "$APP_DIR" ] && [ "$(ls -A "$APP_DIR" 2>/dev/null | head -1)" ]; then
    fail "Pasta $APP_DIR existe mas não é um clone git. Remova-a ou defina APP_DIR."
  else
    log "Clonando repositório em ${APP_DIR}..."
    mkdir -p "$(dirname "$APP_DIR")"
    git clone -b "$GIT_BRANCH" "$REPO_URL" "$APP_DIR"
  fi
}

run_install() {
  log "Instalação Docker + frontend..."
  bash "${DEPLOY_DIR}/install-docker.sh"
}

run_update() {
  log "Atualização Docker + frontend..."
  bash "${DEPLOY_DIR}/update-docker.sh"
}

run_nginx_fix() {
  log "Configurando Nginx → Docker (frontend :3000, /api :3001)..."
  if [ -f "${APP_DIR}/deploy/docker/patch-nginx-docker.sh" ]; then
    bash "${APP_DIR}/deploy/docker/patch-nginx-docker.sh"
  else
    bash "${DEPLOY_DIR}/fix-nginx-api.sh"
  fi
}

run_check() {
  log "Diagnóstico final..."
  bash "${DEPLOY_DIR}/check-api.sh"
}

print_summary() {
  # shellcheck source=deploy/aapanel/common.sh
  source "${DEPLOY_DIR}/common.sh"
  load_deploy_env "${DEPLOY_DIR}/.env.deploy"

  echo ""
  echo "=============================================================================="
  echo -e "${GREEN}Deploy concluído!${NC}"
  echo ""
  echo "  Loja:  $(site_public_url)/"
  echo "  API:   $(site_public_url)/api/health"
  echo "  Admin: admin@sorelle.com.br (senha em server/.env → ADMIN_PASSWORD)"
  echo ""
  echo "Comandos úteis:"
  echo "  bash deploy-vps.sh --update       # atualizar após git push"
  echo "  bash deploy-vps.sh --nginx-only   # reconfigurar proxy Nginx → Docker"
  echo "  bash deploy/aapanel/check-api.sh  # diagnóstico"
  echo ""
  echo "  Frontend Docker: 127.0.0.1:3000 | Backend Docker: 127.0.0.1:3001"
  echo "=============================================================================="
}

case "$MODE" in
  install)
    sync_repository
    ensure_deploy_dir
    fix_script_line_endings
    ensure_env_deploy
    run_install
    run_check
    print_summary
    ;;
  update)
    sync_repository
    ensure_deploy_dir
    fix_script_line_endings
    if [ ! -f "${DEPLOY_DIR}/.env.deploy" ]; then
      ensure_env_deploy
    fi
    run_update
    run_check
    print_summary
    ;;
  nginx-only)
    ensure_deploy_dir
    fix_script_line_endings
    if [ ! -f "${DEPLOY_DIR}/.env.deploy" ]; then
      fail "Arquivo ${DEPLOY_DIR}/.env.deploy não encontrado. Rode a instalação completa primeiro."
    fi
    run_nginx_fix
    run_check
    ;;
esac
