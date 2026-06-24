#!/bin/bash
grep -q $'\r' "$0" 2>/dev/null && sed -i 's/\r$//' "$0" && exec bash "$0" "$@"

# =============================================================================
# Sorelle Presentes — Instalação Ubuntu + aaPanel
# =============================================================================
# Backend (API) + PostgreSQL → Docker
# Frontend (React)            → Website aaPanel / Nginx
#
# PRÉ-REQUISITOS (aaPanel → App Store):
#   - Nginx
#   - Node.js 20
#   - Docker + Docker Compose
#   - Git
#
# SERVIDOR NOVO (sem código no VPS):
#
#   export POSTGRES_PASSWORD='Sorelle@1975'
#   curl -fsSL https://raw.githubusercontent.com/CesarBorgesDev/sorelle-presentes/main/deploy/aapanel/install-aapanel-ubuntu.sh | bash
#
# JÁ CLONOU O REPO:
#
#   cd /www/server/sorelle-presentes
#   export POSTGRES_PASSWORD='Sorelle@1975'
#   bash deploy/aapanel/install-aapanel-ubuntu.sh
# =============================================================================

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/CesarBorgesDev/sorelle-presentes.git}"
APP_DIR="${APP_DIR:-/www/server/sorelle-presentes}"
DOMAIN="${DOMAIN:-sorellepresentes.com.br}"
SITE_ROOT="${SITE_ROOT:-/www/wwwroot/${DOMAIN}}"

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
echo " Sorelle Presentes — Deploy aaPanel + Docker"
echo " Domínio: ${DOMAIN}"
echo " Repo:    ${REPO_URL}"
echo "=============================================================================="
echo ""

require_cmd git

# --- 1. Código-fonte ---
if [ -d "${APP_DIR}/.git" ]; then
  log "[1/2] Repositório encontrado — atualizando..."
  git -C "$APP_DIR" pull || warn "git pull falhou — usando código local."
elif [ -d "$APP_DIR" ] && [ "$(ls -A "$APP_DIR" 2>/dev/null | head -1)" ]; then
  fail "Pasta $APP_DIR existe mas não é um clone git. Remova-a ou defina APP_DIR."
else
  log "[1/2] Clonando repositório em ${APP_DIR}..."
  mkdir -p "$(dirname "$APP_DIR")"
  git clone "$REPO_URL" "$APP_DIR"
fi

DEPLOY_DIR="${APP_DIR}/deploy/aapanel"
INSTALL_DOCKER="${DEPLOY_DIR}/install-docker.sh"

[ -f "$INSTALL_DOCKER" ] || fail "Script install-docker.sh não encontrado. Verifique REPO_URL."

# --- 2. Configuração de deploy ---
if [ ! -f "${DEPLOY_DIR}/.env.deploy" ]; then
  if [ -z "${POSTGRES_PASSWORD:-}" ]; then
    echo ""
    fail "Defina a senha do PostgreSQL antes de instalar:
  export POSTGRES_PASSWORD='Sorelle@1975'"
  fi
  log "[2/2] Criando ${DEPLOY_DIR}/.env.deploy ..."
  cat > "${DEPLOY_DIR}/.env.deploy" << EOF
DOMAIN=${DOMAIN}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
APP_DIR=${APP_DIR}
SITE_ROOT=${SITE_ROOT}
REPO_URL=${REPO_URL}
EOF
else
  log "[2/2] Usando ${DEPLOY_DIR}/.env.deploy existente."
fi

sed -i 's/\r$//' "${DEPLOY_DIR}"/*.sh 2>/dev/null || true

log "Iniciando instalação (Docker + frontend aaPanel)..."
exec bash "$INSTALL_DOCKER"
