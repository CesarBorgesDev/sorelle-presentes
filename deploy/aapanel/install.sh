#!/bin/bash
# Corrige finais de linha Windows (CRLF) antes de executar no Linux
grep -q $'\r' "$0" 2>/dev/null && sed -i 's/\r$//' "$0" && exec bash "$0" "$@"

# =============================================================================
# Instalação Sorelle Presentes — Ubuntu + aaPanel
# =============================================================================
# Uso (no servidor, como root ou com sudo):
#
#   export DOMAIN="loja.seudominio.com.br"
#   export REPO_URL="https://github.com/SEU_USUARIO/sorelle-presentes.git"
#   export APP_DIR="/home/deploy/sorelle-presentes"
#   export DB_NAME="sorelle"
#   export DB_USER="sorelle"
#   export DB_PASS="senha_forte_aqui"
#
#   bash deploy/aapanel/install.sh
#
# Pré-requisitos no aaPanel (App Store):
#   - Nginx
#   - Node.js 20.x
#   - PM2 Manager
#   - PostgreSQL 15
#   - Git (opcional, se clonar via git)
# =============================================================================

set -euo pipefail

DOMAIN="${DOMAIN:-}"
REPO_URL="${REPO_URL:-https://github.com/CesarBorgesDev/sorelle-presentes.git}"
APP_DIR="${APP_DIR:-/home/deploy/sorelle-presentes}"
DB_NAME="${DB_NAME:-sorelle}"
DB_USER="${DB_USER:-sorelle}"
DB_PASS="${DB_PASS:-}"

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

if [ -z "$DOMAIN" ]; then
  fail "Defina DOMAIN (ex.: export DOMAIN=loja.exemplo.com.br)"
fi

if [ -z "$DB_PASS" ]; then
  fail "Defina DB_PASS com a senha do PostgreSQL (export DB_PASS=...)"
fi

require_cmd node
require_cmd npm
require_cmd psql
require_cmd pm2

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 18 ]; then
  fail "Node.js 18+ necessário. Instale Node 20 pelo aaPanel."
fi

log "Domínio: $DOMAIN"
log "Diretório: $APP_DIR"

# --- Código-fonte ---
if [ -d "$APP_DIR/.git" ]; then
  log "Atualizando repositório..."
  git -C "$APP_DIR" pull
elif [ -n "$REPO_URL" ]; then
  log "Clonando repositório..."
  mkdir -p "$(dirname "$APP_DIR")"
  git clone "$REPO_URL" "$APP_DIR"
elif [ ! -f "$APP_DIR/package.json" ]; then
  fail "Projeto não encontrado em $APP_DIR. Defina REPO_URL ou copie os arquivos manualmente."
fi

cd "$APP_DIR"

# --- Banco de dados ---
log "Verificando banco PostgreSQL..."
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE USER \"$DB_USER\" WITH PASSWORD '$DB_PASS';"
  log "Usuário PostgreSQL '$DB_USER' criado."
fi

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";"
  log "Banco '$DB_NAME' criado."
fi

# --- Variáveis de ambiente ---
if [ ! -f server/.env ]; then
  log "Criando server/.env a partir do exemplo..."
  cp deploy/aapanel/env.production.example server/.env
  sed -i "s|DATABASE_URL=.*|DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}|" server/.env
  sed -i "s|CORS_ORIGIN=.*|CORS_ORIGIN=https://${DOMAIN}|" server/.env
  sed -i "s|FRONTEND_URL=.*|FRONTEND_URL=https://${DOMAIN}|" server/.env
  sed -i "s|APP_PUBLIC_URL=.*|APP_PUBLIC_URL=https://${DOMAIN}|" server/.env
  JWT_SECRET=$(openssl rand -base64 48 | tr -d '/+=' | head -c 64)
  sed -i "s|JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" server/.env
  warn "Revise server/.env (admin, Cielo, Correios, PIX) antes de ir para produção."
else
  log "server/.env já existe — mantendo arquivo atual."
fi

# --- Dependências e build ---
log "Instalando dependências do frontend..."
npm ci

log "Instalando dependências da API..."
npm ci --prefix server

log "Build do frontend..."
npm run build

mkdir -p server/uploads/generated server/uploads/products server/uploads/temp
chown -R www:www server/uploads 2>/dev/null || true

log "Migrando e populando banco..."
npm run db:migrate --prefix server
npm run db:seed --prefix server

# --- PM2 ---
log "Iniciando API com PM2..."
pm2 delete sorelle-api 2>/dev/null || true
pm2 start deploy/aapanel/ecosystem.config.cjs --cwd "$APP_DIR"
pm2 save

# --- Permissões do site aaPanel ---
SITE_ROOT="${SITE_ROOT:-/home/deploy/sorelle-presentes/dist}"
if [ -d "$SITE_ROOT" ]; then
  log "Sincronizando dist → $SITE_ROOT"
  rsync -a --delete dist/ "$SITE_ROOT/"
  chown -R www:www "$SITE_ROOT"
else
  warn "Pasta do site não existe: $SITE_ROOT"
  warn "Crie o site no aaPanel: Website → sorelle-presentes → root ${SITE_ROOT}"
fi

echo ""
echo "=============================================================================="
echo -e "${GREEN}Instalação concluída!${NC}"
echo ""
echo "Próximos passos no aaPanel:"
echo "  1. Website → $DOMAIN → Config"
echo "     Cole o conteúdo de deploy/aapanel/nginx-site.conf.example"
echo "     (ajuste 'root' se usar outro caminho)"
echo "  2. Website → $DOMAIN → SSL → Let's Encrypt (HTTPS)"
echo "  3. App Store → PM2 → confirme 'sorelle-api' online"
echo "  4. Firewall: libere 80/443; mantenha 3001 apenas em localhost"
echo ""
echo "Testes:"
echo "  curl -s http://127.0.0.1:3001/api/health"
echo "  https://${DOMAIN}/"
echo "=============================================================================="
